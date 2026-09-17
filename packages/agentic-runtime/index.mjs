import { RiskLevel, makeId } from '../contracts/index.mjs';
import { AgentRole, DEFAULT_AGENT_POLICIES } from '../agents/index.mjs';
import { calculateRisk, wrapUntrusted } from '../security/index.mjs';

export const PermissionProfile = Object.freeze({
  OBSERVER:'observer', NORMAL:'normal', DEVELOPER:'developer'
});

const PROFILE_MAX_RISK = Object.freeze({
  [PermissionProfile.OBSERVER]: RiskLevel.READ_ONLY,
  [PermissionProfile.NORMAL]: RiskLevel.LOW,
  [PermissionProfile.DEVELOPER]: RiskLevel.MEDIUM
});

const ROLE_PATTERNS = Object.freeze([
  [AgentRole.RESEARCH, /(pesquis|internet|web|fonte|evid[eê]ncia|atual)/i],
  [AgentRole.SECURITY, /(seguran|risco|rls|auth|pentest|vulner)/i],
  [AgentRole.QA, /(teste|playwright|qa|valid|regress)/i],
  [AgentRole.DEVELOPER, /(c[oó]digo|github|corrig|implementar|desenvolv|refator)/i],
  [AgentRole.BROWSER, /(browser|navegador|site|p[aá]gina)/i],
  [AgentRole.DESKTOP, /(desktop|windows|arquivo local|terminal)/i]
]);

export class PlanningFlow {
  build(goal) {
    const text = String(goal || '');
    const roles = ROLE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([role]) => role);
    if (!roles.length) roles.push(AgentRole.SUPERVISOR);
    return roles.map((role, index) => ({
      id:`agent_step_${index + 1}`,
      role,
      objective:this.#objective(role, text),
      status:'pending'
    }));
  }
  #objective(role, goal) {
    const map = {
      [AgentRole.RESEARCH]:'Pesquisar e separar evidência atual de hipótese',
      [AgentRole.SECURITY]:'Avaliar limites, risco e constraints antes da ação',
      [AgentRole.QA]:'Definir e executar validações comportamentais e regressão',
      [AgentRole.DEVELOPER]:'Preparar mudança isolada, reversível e testável',
      [AgentRole.BROWSER]:'Executar navegação com fronteira de conteúdo não confiável',
      [AgentRole.DESKTOP]:'Executar ação local somente via Satellite autorizado',
      [AgentRole.SUPERVISOR]:'Decompor a solicitação e selecionar capacidades mínimas'
    };
    return `${map[role] || map[AgentRole.SUPERVISOR]}. Meta: ${goal}`;
  }
}

export class SandboxPolicy {
  constructor({ profile = PermissionProfile.NORMAL } = {}) { this.profile = profile; }
  evaluate({ role = AgentRole.SUPERVISOR, risk = RiskLevel.READ_ONLY, action = '' } = {}) {
    const agentMax = DEFAULT_AGENT_POLICIES[role]?.maxRisk ?? RiskLevel.READ_ONLY;
    const profileMax = PROFILE_MAX_RISK[this.profile] ?? RiskLevel.READ_ONLY;
    const maxAllowed = Math.min(agentMax, profileMax);
    return { allowed:risk <= maxAllowed, maxAllowed, role, profile:this.profile, action:String(action) };
  }
}

export class AgenticExecutionKernel {
  constructor({ taskRuntime, tools, security, traces, contextCompiler, memory, profile = PermissionProfile.NORMAL }) {
    Object.assign(this, { taskRuntime, tools, security, traces, contextCompiler, memory });
    this.planning = new PlanningFlow();
    this.sandbox = new SandboxPolicy({ profile });
  }

  prepare(goal, metadata = {}) {
    const flow = this.planning.build(goal);
    const task = this.taskRuntime.create({ goal, plan:flow.map((s) => s.objective), metadata:{ ...metadata, agentFlow:flow } });
    return { task, flow };
  }

  authorize({ action, role, manifestRisk = 0, hostRisk = 0, payloadRisk = 0, sourceTrustRisk = 0, approvalId = null, scope = {} }) {
    const risk = calculateRisk({ manifest:manifestRisk, host:hostRisk, payload:payloadRisk, sourceTrust:sourceTrustRisk });
    const constraint = this.security.constraints.evaluate(action);
    if (!constraint.allowed) return { allowed:false, reason:'constraint', risk, constraint };
    const sandbox = this.sandbox.evaluate({ role, risk, action });
    if (!sandbox.allowed) return { allowed:false, reason:'sandbox', risk, sandbox };
    if (risk >= RiskLevel.MEDIUM) {
      const approval = this.security.approvals.consume(approvalId, { capability:action, scope });
      if (!approval.ok) return { allowed:false, reason:'approval_required', risk, sandbox, approval };
    }
    return { allowed:true, risk, sandbox };
  }

  ingestExternal(data, source) { return wrapUntrusted(data, source); }

  capabilitySearch(query, limit = 8) {
    return this.tools.search(query, { limit }).map((tool) => ({ id:tool.id, state:tool.state, risk:tool.risk, description:tool.description }));
  }

  checkpoint(taskId, label = 'agentic_checkpoint') { return this.taskRuntime.checkpoint(taskId, label); }
}
