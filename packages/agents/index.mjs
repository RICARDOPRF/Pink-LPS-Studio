import { RiskLevel } from '../contracts/index.mjs';

export const AgentRole = Object.freeze({
  SUPERVISOR:'supervisor', RESEARCH:'research', DEVELOPER:'developer', QA:'qa', SECURITY:'security', BROWSER:'browser', DESKTOP:'desktop', VERIFIER:'verifier'
});

export const DEFAULT_AGENT_POLICIES = Object.freeze({
  [AgentRole.RESEARCH]: { maxRisk: RiskLevel.READ_ONLY, tools: ['ai.gemini-research'] },
  [AgentRole.DEVELOPER]: { maxRisk: RiskLevel.MEDIUM, tools: ['ai.openai'] },
  [AgentRole.QA]: { maxRisk: RiskLevel.LOW, tools: [] },
  [AgentRole.SECURITY]: { maxRisk: RiskLevel.READ_ONLY, tools: [] },
  [AgentRole.BROWSER]: { maxRisk: RiskLevel.MEDIUM, tools: [] },
  [AgentRole.DESKTOP]: { maxRisk: RiskLevel.MEDIUM, tools: [] },
  [AgentRole.VERIFIER]: { maxRisk: RiskLevel.READ_ONLY, tools: [] }
});

export class PinkSupervisor {
  constructor({ taskRuntime, tools, contextCompiler, memory, security, traces }) {
    Object.assign(this, { taskRuntime, tools, contextCompiler, memory, security, traces });
  }

  plan(goal) {
    const text = String(goal || '').toLowerCase();
    const steps = [];
    if (/(pesquis|internet|web|atual)/.test(text)) steps.push('Pesquisar evidências atuais');
    if (/(código|codigo|github|corrig|implementar|desenvolv)/.test(text)) steps.push('Analisar implementação e preparar mudança isolada');
    steps.push('Validar evidências e segurança');
    steps.push('Apresentar resultado e próximos gates');
    return steps;
  }

  createTask(goal, metadata = {}) { return this.taskRuntime.create({ goal, plan: this.plan(goal), metadata }); }

  capabilityAnswer(query) {
    const matches = this.tools.search(query, { limit: 6 });
    return { matches, available: matches.filter((t) => t.state === 'available') };
  }
}
