import { RiskLevel, makeId } from '../contracts/index.mjs';
import { AgentRole, DEFAULT_AGENT_POLICIES } from '../agents/index.mjs';
import { GuardrailStage, createDefaultGuardrails, redactSecretLike } from '../guardrails/index.mjs';

const ROLES = new Set(Object.values(AgentRole));
const OMIT_CONTEXT_KEY = /(history|messages|transcript|conversation|raw.?prompt|raw.?response)/i;
const SECRET_CONTEXT_KEY = /(api.?key|secret|password|passwd|token|authorization|cookie|session)/i;

export const DEFAULT_HANDOFF_ROUTES = Object.freeze([
  [AgentRole.SUPERVISOR, AgentRole.RESEARCH], [AgentRole.SUPERVISOR, AgentRole.DEVELOPER],
  [AgentRole.SUPERVISOR, AgentRole.QA], [AgentRole.SUPERVISOR, AgentRole.SECURITY],
  [AgentRole.SUPERVISOR, AgentRole.BROWSER], [AgentRole.SUPERVISOR, AgentRole.DESKTOP],
  [AgentRole.SUPERVISOR, AgentRole.VERIFIER], [AgentRole.VERIFIER, AgentRole.SUPERVISOR],
  [AgentRole.RESEARCH, AgentRole.SUPERVISOR], [AgentRole.DEVELOPER, AgentRole.SUPERVISOR],
  [AgentRole.QA, AgentRole.SUPERVISOR], [AgentRole.SECURITY, AgentRole.SUPERVISOR],
  [AgentRole.BROWSER, AgentRole.SUPERVISOR], [AgentRole.DESKTOP, AgentRole.SUPERVISOR],
  [AgentRole.DEVELOPER, AgentRole.QA], [AgentRole.QA, AgentRole.DEVELOPER],
  [AgentRole.DEVELOPER, AgentRole.SECURITY], [AgentRole.SECURITY, AgentRole.DEVELOPER]
].map(([from, to]) => `${from}->${to}`));

function sanitizeContext(value, depth = 0) {
  if (depth > 4) return '[TRUNCATED_DEPTH]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…[truncated]` : value;
  if (Array.isArray(value)) return value.slice(0, 16).map((item) => sanitizeContext(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 36)) {
      if (OMIT_CONTEXT_KEY.test(key)) out[key] = '[OMITTED_HANDOFF_CONTEXT]';
      else if (SECRET_CONTEXT_KEY.test(key)) out[key] = '[REDACTED_SECRET]';
      else out[key] = sanitizeContext(item, depth + 1);
    }
    return redactSecretLike(out);
  }
  return String(value);
}

function normalizeEvidenceRefs(refs = []) {
  return refs.slice(0, 16).map((ref) => {
    if (typeof ref === 'string') return { id:ref.slice(0, 240) };
    if (!ref || typeof ref !== 'object') return null;
    return {
      id:String(ref.id || '').slice(0, 240),
      type:String(ref.type || '').slice(0, 80),
      source:String(ref.source || '').slice(0, 320),
      summary:String(ref.summary || '').slice(0, 600)
    };
  }).filter(Boolean);
}

function destinationRiskCap(role) {
  if (role === AgentRole.SUPERVISOR) return RiskLevel.CRITICAL;
  return DEFAULT_AGENT_POLICIES[role]?.maxRisk ?? RiskLevel.READ_ONLY;
}

export class HandoffBroker {
  constructor({ routes = DEFAULT_HANDOFF_ROUTES, guardrails = createDefaultGuardrails(), traces = null } = {}) {
    this.routes = new Set(routes);
    this.guardrails = guardrails;
    this.traces = traces;
    this.audit = [];
  }

  create({ from, to, reason, summary, requiredRisk = RiskLevel.READ_ONLY, context = {}, evidenceRefs = [], taskId = null, trace = null } = {}) {
    const invalid = this.#validate({ from, to, reason, summary, requiredRisk });
    if (invalid) return this.#reject({ from, to, reason, requiredRisk, taskId, trace }, invalid);

    const envelope = Object.freeze({
      id:makeId('handoff'), from, to,
      reason:String(reason).trim().slice(0, 500),
      summary:String(summary).trim().slice(0, 4000),
      requiredRisk:Number(requiredRisk),
      context:Object.freeze(sanitizeContext(context)),
      evidenceRefs:Object.freeze(normalizeEvidenceRefs(evidenceRefs)),
      taskId:taskId || null,
      createdAt:new Date().toISOString()
    });

    const guardrail = this.guardrails.evaluate(GuardrailStage.HANDOFF, { payload:envelope, from, to, risk:requiredRisk });
    if (!guardrail.ok) return this.#reject(envelope, `guardrail:${guardrail.tripwire || guardrail.status}`, guardrail, trace);

    const audit = { id:envelope.id, from, to, reason:envelope.reason, requiredRisk:envelope.requiredRisk, taskId:envelope.taskId, accepted:true, createdAt:envelope.createdAt };
    this.audit.push(audit);
    if (trace && this.traces?.event) this.traces.event(trace, 'handoff', { handoffId:envelope.id, from, to, requiredRisk:envelope.requiredRisk, accepted:true });
    return { accepted:true, envelope, guardrail };
  }

  #validate({ from, to, reason, summary, requiredRisk }) {
    if (!ROLES.has(from) || !ROLES.has(to)) return 'invalid_role';
    if (from === to) return 'same_role';
    if (!String(reason || '').trim()) return 'reason_required';
    if (!String(summary || '').trim()) return 'summary_required';
    if (!this.routes.has(`${from}->${to}`)) return 'route_not_allowed';
    if (!Number.isFinite(Number(requiredRisk)) || Number(requiredRisk) < RiskLevel.READ_ONLY) return 'invalid_risk';
    if (Number(requiredRisk) > destinationRiskCap(to)) return 'destination_risk_cap';
    return null;
  }

  #reject(input, reason, guardrail = null, traceOverride = null) {
    const trace = traceOverride || input?.trace || null;
    const audit = {
      id:input?.id || makeId('handoff_rejected'), from:input?.from || null, to:input?.to || null,
      reason:String(reason), requiredRisk:Number(input?.requiredRisk ?? RiskLevel.READ_ONLY), taskId:input?.taskId || null,
      accepted:false, createdAt:new Date().toISOString()
    };
    this.audit.push(audit);
    if (trace && this.traces?.event) this.traces.event(trace, 'handoff', { handoffId:audit.id, from:audit.from, to:audit.to, requiredRisk:audit.requiredRisk, accepted:false, reason:audit.reason });
    return { accepted:false, reason:audit.reason, guardrail };
  }

  snapshot() {
    const accepted = this.audit.filter((item) => item.accepted).length;
    return { routes:this.routes.size, accepted, rejected:this.audit.length - accepted, recent:this.audit.slice(-10).map((item) => ({ ...item })) };
  }
}
