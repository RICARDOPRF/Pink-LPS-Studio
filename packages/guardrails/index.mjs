import { RiskLevel } from '../contracts/index.mjs';

export const GuardrailStage = Object.freeze({
  INPUT:'input', TOOL_INPUT:'tool_input', TOOL_OUTPUT:'tool_output', OUTPUT:'output', HANDOFF:'handoff'
});

export const GuardrailDecision = Object.freeze({ PASS:'pass', REVIEW:'review', BLOCK:'block' });

const SECRET_PATTERNS = Object.freeze([
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
]);

const SECRET_KEY = /(api.?key|secret|password|passwd|token|authorization|cookie|session)/i;

function serialize(value, maxChars = 96_000) {
  let raw = '';
  try { raw = typeof value === 'string' ? value : JSON.stringify(value); }
  catch { raw = String(value ?? ''); }
  return raw.length > maxChars ? raw.slice(0, maxChars) : raw;
}

export function containsSecretLike(value) {
  const raw = serialize(value);
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(raw);
  });
}

export function redactSecretLike(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED_DEPTH]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      out = out.replace(pattern, '[REDACTED_SECRET]');
    }
    return out.length > 4000 ? `${out.slice(0, 4000)}…[truncated]` : out;
  }
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => redactSecretLike(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 48)) {
      out[key] = SECRET_KEY.test(key) ? '[REDACTED_SECRET]' : redactSecretLike(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export class GuardrailPipeline {
  constructor({ rules = [] } = {}) { this.rules = []; for (const rule of rules) this.register(rule); }

  register(rule) {
    if (!rule?.id || typeof rule.check !== 'function') throw new TypeError('guardrail requires id and check');
    const stages = Array.isArray(rule.stages) && rule.stages.length ? [...new Set(rule.stages)] : Object.values(GuardrailStage);
    const normalized = Object.freeze({ id:String(rule.id), stages:Object.freeze(stages), check:rule.check });
    this.rules.push(normalized); return normalized;
  }

  evaluate(stage, context = {}) {
    const decisions = [];
    for (const rule of this.rules.filter((item) => item.stages.includes(stage))) {
      try {
        const result = rule.check(context) || { decision:GuardrailDecision.PASS };
        const decision = Object.values(GuardrailDecision).includes(result.decision) ? result.decision : GuardrailDecision.PASS;
        decisions.push({ id:rule.id, decision, reason:String(result.reason || ''), metadata:redactSecretLike(result.metadata || {}) });
      } catch (error) {
        decisions.push({ id:rule.id, decision:GuardrailDecision.BLOCK, reason:`guardrail_error:${String(error?.message || error)}`, metadata:{} });
      }
    }
    const blocked = decisions.find((item) => item.decision === GuardrailDecision.BLOCK);
    const review = decisions.find((item) => item.decision === GuardrailDecision.REVIEW);
    const status = blocked ? GuardrailDecision.BLOCK : review ? GuardrailDecision.REVIEW : GuardrailDecision.PASS;
    return Object.freeze({ ok:status === GuardrailDecision.PASS, status, stage, tripwire:blocked?.id || review?.id || null, decisions:Object.freeze(decisions) });
  }

  snapshot() { return { rules:this.rules.map((rule) => ({ id:rule.id, stages:[...rule.stages] })) }; }
}

export function createDefaultGuardrails({ maxContextChars = 48_000 } = {}) {
  const pipeline = new GuardrailPipeline();

  pipeline.register({
    id:'untrusted-write-tripwire', stages:[GuardrailStage.TOOL_INPUT],
    check:({ sourceTrust = 'trusted', risk = RiskLevel.READ_ONLY } = {}) =>
      sourceTrust === 'untrusted' && Number(risk) > RiskLevel.READ_ONLY
        ? { decision:GuardrailDecision.BLOCK, reason:'untrusted source cannot directly authorize a mutating tool call' }
        : { decision:GuardrailDecision.PASS }
  });

  pipeline.register({
    id:'secret-egress-tripwire', stages:[GuardrailStage.HANDOFF, GuardrailStage.TOOL_OUTPUT, GuardrailStage.OUTPUT],
    check:({ payload = null } = {}) => containsSecretLike(payload)
      ? { decision:GuardrailDecision.BLOCK, reason:'secret-like value detected on agent egress boundary' }
      : { decision:GuardrailDecision.PASS }
  });

  pipeline.register({
    id:'bounded-agent-context', stages:[GuardrailStage.HANDOFF, GuardrailStage.TOOL_INPUT],
    check:(context = {}) => {
      const size = serialize(context, maxContextChars + 1).length;
      return size > maxContextChars
        ? { decision:GuardrailDecision.REVIEW, reason:'agent context exceeds bounded transfer limit', metadata:{ size, maxContextChars } }
        : { decision:GuardrailDecision.PASS };
    }
  });

  return pipeline;
}
