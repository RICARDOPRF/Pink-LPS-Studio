import { RiskLevel, makeId } from '../contracts/index.mjs';
import { AgentRole, DEFAULT_AGENT_POLICIES } from '../agents/index.mjs';

export const OrchestrationStatus = Object.freeze({
  RUNNING:'running', COMPLETED:'completed', BLOCKED:'blocked', FAILED:'failed'
});

export const DEFAULT_ORCHESTRATION_BUDGET = Object.freeze({
  maxAgentRuns:12,
  maxRetriesPerStep:1,
  maxVerificationRounds:1,
  maxToolCalls:40,
  maxTokens:120000,
  maxCostUsd:5,
  timeoutMs:120000,
  stepTimeoutMs:45000
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeBudget(input = {}) {
  return Object.freeze({
    maxAgentRuns:Math.max(1, Math.floor(finite(input.maxAgentRuns, DEFAULT_ORCHESTRATION_BUDGET.maxAgentRuns))),
    maxRetriesPerStep:Math.max(0, Math.floor(finite(input.maxRetriesPerStep, DEFAULT_ORCHESTRATION_BUDGET.maxRetriesPerStep))),
    maxVerificationRounds:Math.max(0, Math.floor(finite(input.maxVerificationRounds, DEFAULT_ORCHESTRATION_BUDGET.maxVerificationRounds))),
    maxToolCalls:Math.max(0, Math.floor(finite(input.maxToolCalls, DEFAULT_ORCHESTRATION_BUDGET.maxToolCalls))),
    maxTokens:Math.max(0, Math.floor(finite(input.maxTokens, DEFAULT_ORCHESTRATION_BUDGET.maxTokens))),
    maxCostUsd:finite(input.maxCostUsd, DEFAULT_ORCHESTRATION_BUDGET.maxCostUsd),
    timeoutMs:Math.max(1000, Math.floor(finite(input.timeoutMs, DEFAULT_ORCHESTRATION_BUDGET.timeoutMs))),
    stepTimeoutMs:Math.max(250, Math.floor(finite(input.stepTimeoutMs, DEFAULT_ORCHESTRATION_BUDGET.stepTimeoutMs)))
  });
}

function policyRisk(role) {
  if (role === AgentRole.SUPERVISOR) return RiskLevel.READ_ONLY;
  return DEFAULT_AGENT_POLICIES[role]?.maxRisk ?? RiskLevel.READ_ONLY;
}

function parallelSafe(role) {
  return role !== AgentRole.SUPERVISOR && role !== AgentRole.VERIFIER && policyRisk(role) === RiskLevel.READ_ONLY;
}

function safeSummary(value, max = 1600) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

function evidenceRefs(value = []) {
  return (Array.isArray(value) ? value : []).slice(0, 16).map((item) => {
    if (typeof item === 'string') return { id:item.slice(0, 240) };
    if (!item || typeof item !== 'object') return null;
    return {
      id:String(item.id || '').slice(0, 240),
      type:String(item.type || '').slice(0, 80),
      source:String(item.source || '').slice(0, 320),
      summary:String(item.summary || '').slice(0, 600)
    };
  }).filter(Boolean);
}

function usageOf(result = {}) {
  const usage = result?.usage || {};
  return {
    toolCalls:Math.max(0, Number(usage.toolCalls) || 0),
    tokens:Math.max(0, Number(usage.tokens) || 0),
    costUsd:Math.max(0, Number(usage.costUsd) || 0)
  };
}

function delayReject(ms, label = 'step_timeout') {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms));
}

export class IndependentVerifier {
  evaluate({ results = [] } = {}) {
    const findings = [];
    const retryRoles = new Set();
    for (const result of results) {
      if (!result?.ok) {
        findings.push({ role:result?.role || null, code:'agent_failed', severity:'block', summary:safeSummary(result?.error || 'agent failed') });
        if (result?.role) retryRoles.add(result.role);
        continue;
      }
      if (!safeSummary(result.summary)) {
        findings.push({ role:result.role, code:'missing_summary', severity:'block', summary:'Agent result has no bounded summary.' });
        retryRoles.add(result.role);
      }
      if (policyRisk(result.role) > RiskLevel.READ_ONLY && !evidenceRefs(result.evidenceRefs).length) {
        findings.push({ role:result.role, code:'missing_evidence', severity:'block', summary:'Mutating agent result requires evidence before acceptance.' });
        retryRoles.add(result.role);
      }
    }
    const blocking = findings.filter((item) => item.severity === 'block');
    return {
      ok:blocking.length === 0,
      summary:blocking.length ? `${blocking.length} blocking verification finding(s).` : 'Independent verification passed.',
      findings,
      retryRoles:[...retryRoles]
    };
  }
}

export class MultiAgentOrchestrator {
  constructor({ agentic, handoffs, traces, taskRuntime, verifier = null, executors = {} } = {}) {
    if (!agentic || !handoffs || !traces || !taskRuntime) throw new TypeError('orchestrator requires agentic, handoffs, traces and taskRuntime');
    Object.assign(this, { agentic, handoffs, traces, taskRuntime });
    this.verifier = verifier || new IndependentVerifier();
    this.executors = new Map();
    this.runs = [];
    for (const [role, execute] of Object.entries(executors || {})) this.register(role, execute);
  }

  register(role, execute) {
    if (!Object.values(AgentRole).includes(role)) throw new TypeError(`unknown agent role: ${role}`);
    if (role === AgentRole.SUPERVISOR) throw new TypeError('supervisor is owned by the orchestrator');
    if (typeof execute !== 'function') throw new TypeError('agent executor must be a function');
    this.executors.set(role, execute);
    return this;
  }

  plan(goal) {
    const steps = this.agentic.planning.build(goal).map((step) => ({ ...step, risk:policyRisk(step.role), parallelEligible:parallelSafe(step.role) }));
    const waves = [];
    let parallel = [];
    const flush = () => {
      if (!parallel.length) return;
      waves.push({ id:makeId('wave'), parallel:parallel.length > 1, steps:parallel });
      parallel = [];
    };
    for (const step of steps) {
      if (step.parallelEligible) parallel.push(step);
      else { flush(); waves.push({ id:makeId('wave'), parallel:false, steps:[step] }); }
    }
    flush();
    return { steps, waves };
  }

  async run(goal, { budget:budgetInput = {}, metadata = {} } = {}) {
    const budget = normalizeBudget(budgetInput);
    const orchestration = this.plan(goal);
    const taskPlan = [...orchestration.steps.map((step) => step.objective), 'Executar verificação independente antes da conclusão'];
    const task = this.taskRuntime.create({ goal, plan:taskPlan, metadata:{ ...metadata, orchestrator:'v16', agentFlow:orchestration.steps } });
    this.taskRuntime.start(task.id);

    const trace = this.traces.start({ taskId:task.id, goal, variant:'multi-agent-v16' });
    const rootSpan = this.traces.startSpan(trace, { name:'multi-agent-orchestration', kind:'orchestrator', attributes:{ taskId:task.id } });
    const startedAt = Date.now();
    const usage = { agentRuns:0, toolCalls:0, tokens:0, costUsd:0 };
    const results = new Map();
    const run = {
      id:makeId('orchestration'), taskId:task.id, traceId:trace.id, status:OrchestrationStatus.RUNNING,
      budget, usage, waves:orchestration.waves.map((wave) => ({ id:wave.id, parallel:wave.parallel, roles:wave.steps.map((step) => step.role) })),
      verification:null, startedAt:new Date().toISOString(), endedAt:null, reason:null
    };

    const stop = (status, reason) => {
      run.status = status; run.reason = String(reason || status); run.endedAt = new Date().toISOString();
      if (status === OrchestrationStatus.BLOCKED) this.taskRuntime.block(task.id, run.reason);
      else if (status === OrchestrationStatus.FAILED) this.taskRuntime.fail(task.id, run.reason);
      try { this.traces.finishSpan(trace, rootSpan, { status:status === OrchestrationStatus.COMPLETED ? 'ok' : 'error', attributes:{ reason:run.reason } }); } catch {}
      this.traces.finish(trace, { success:status === OrchestrationStatus.COMPLETED, tokens:usage.tokens, cost:usage.costUsd });
      this.runs.push(structuredClone({ ...run, results:[...results.values()] }));
      return structuredClone({ ...run, task:this.taskRuntime.get(task.id), results:[...results.values()] });
    };

    try {
      for (const wave of orchestration.waves) {
        const timeViolation = this.#timeViolation(startedAt, budget);
        if (timeViolation) return stop(OrchestrationStatus.BLOCKED, timeViolation);
        if (usage.agentRuns + wave.steps.filter((step) => step.role !== AgentRole.SUPERVISOR).length > budget.maxAgentRuns) {
          return stop(OrchestrationStatus.BLOCKED, 'budget:max_agent_runs');
        }

        const executed = wave.parallel
          ? await Promise.all(wave.steps.map((step) => this.#executeStep({ step, goal, taskId:task.id, trace, usage, budget, startedAt })))
          : [await this.#executeStep({ step:wave.steps[0], goal, taskId:task.id, trace, usage, budget, startedAt })];

        for (const result of executed) {
          results.set(result.role, result);
          if (!result.ok) return stop(result.blocked ? OrchestrationStatus.BLOCKED : OrchestrationStatus.FAILED, result.error || `agent_failed:${result.role}`);
          const violation = this.#budgetViolation(usage, budget);
          if (violation) return stop(OrchestrationStatus.BLOCKED, violation);
          this.taskRuntime.completeStep(task.id, { type:'agent-result', source:result.role, summary:result.summary || `${result.role} completed` });
        }
        this.taskRuntime.checkpoint(task.id, `wave:${wave.id}`);
      }

      let verification = await this.#verify({ goal, taskId:task.id, trace, results:[...results.values()], usage, budget, startedAt, round:0 });
      let verificationBudgetViolation = this.#budgetViolation(usage, budget);
      if (verificationBudgetViolation) return stop(OrchestrationStatus.BLOCKED, verificationBudgetViolation);
      let round = 0;
      while (!verification.ok && round < budget.maxVerificationRounds && verification.retryRoles?.length) {
        round += 1;
        const roles = [...new Set(verification.retryRoles)].filter((role) => results.has(role));
        if (!roles.length) break;
        for (const role of roles) {
          if (usage.agentRuns + 1 > budget.maxAgentRuns) return stop(OrchestrationStatus.BLOCKED, 'budget:max_agent_runs');
          const original = orchestration.steps.find((step) => step.role === role);
          const revised = await this.#executeStep({
            step:original,
            goal, taskId:task.id, trace, usage, budget, startedAt,
            correction:{ round, verifierSummary:verification.summary, findings:verification.findings }
          });
          results.set(role, revised);
          if (!revised.ok) return stop(revised.blocked ? OrchestrationStatus.BLOCKED : OrchestrationStatus.FAILED, revised.error || `agent_revision_failed:${role}`);
          const violation = this.#budgetViolation(usage, budget);
          if (violation) return stop(OrchestrationStatus.BLOCKED, violation);
        }
        this.taskRuntime.checkpoint(task.id, `verification_revision:${round}`);
        verification = await this.#verify({ goal, taskId:task.id, trace, results:[...results.values()], usage, budget, startedAt, round });
        verificationBudgetViolation = this.#budgetViolation(usage, budget);
        if (verificationBudgetViolation) return stop(OrchestrationStatus.BLOCKED, verificationBudgetViolation);
      }

      run.verification = verification;
      if (!verification.ok) return stop(OrchestrationStatus.BLOCKED, `verification:${verification.summary || 'rejected'}`);
      this.taskRuntime.completeStep(task.id, { type:'verification', source:AgentRole.VERIFIER, summary:verification.summary || 'Verification passed' });
      run.status = OrchestrationStatus.COMPLETED;
      run.endedAt = new Date().toISOString();
      try { this.traces.finishSpan(trace, rootSpan, { status:'ok', attributes:{ verificationRounds:(verification.round ?? 0) + 1 } }); } catch {}
      this.traces.finish(trace, { success:true, tokens:usage.tokens, cost:usage.costUsd });
      this.runs.push(structuredClone({ ...run, results:[...results.values()] }));
      return structuredClone({ ...run, task:this.taskRuntime.get(task.id), results:[...results.values()] });
    } catch (error) {
      return stop(OrchestrationStatus.FAILED, `orchestrator_error:${String(error?.message || error)}`);
    }
  }

  async #executeStep({ step, goal, taskId, trace, usage, budget, startedAt, correction = null }) {
    if (!step) return { ok:false, role:null, error:'missing_step' };
    if (step.role === AgentRole.SUPERVISOR) {
      return { ok:true, role:AgentRole.SUPERVISOR, summary:'Supervisor retained orchestration ownership.', evidenceRefs:[], usage:{ toolCalls:0, tokens:0, costUsd:0 }, attempts:0 };
    }
    const execute = this.executors.get(step.role);
    if (!execute) return { ok:false, role:step.role, error:'executor_unavailable', retryable:false };

    let lastError = 'agent_failed';
    for (let attempt = 0; attempt <= budget.maxRetriesPerStep; attempt += 1) {
      const timeViolation = this.#timeViolation(startedAt, budget);
      if (timeViolation) return { ok:false, blocked:true, role:step.role, error:timeViolation, attempts:attempt };
      if (usage.agentRuns + 1 > budget.maxAgentRuns) return { ok:false, blocked:true, role:step.role, error:'budget:max_agent_runs', attempts:attempt };

      const outbound = this.handoffs.create({
        from:AgentRole.SUPERVISOR, to:step.role,
        reason:correction ? 'verifier_revision' : 'orchestrated_subtask',
        summary:step.objective,
        requiredRisk:step.risk,
        taskId, trace,
        context:{ goal:safeSummary(goal, 2400), attempt:attempt + 1, correction },
        evidenceRefs:[]
      });
      if (!outbound.accepted) return { ok:false, blocked:true, role:step.role, error:`handoff:${outbound.reason}`, attempts:attempt };

      const span = this.traces.startSpan(trace, { name:`agent:${step.role}`, kind:'agent', parentId:null, attributes:{ attempt:attempt + 1, correctionRound:correction?.round || 0 } });
      usage.agentRuns += 1;
      this.traces.event(trace, 'agent_attempt', { role:step.role, attempt:attempt + 1, correctionRound:correction?.round || 0 });

      try {
        const remaining = Math.max(250, Math.min(budget.stepTimeoutMs, budget.timeoutMs - (Date.now() - startedAt)));
        const raw = await Promise.race([
          Promise.resolve(execute({ role:step.role, objective:step.objective, goal, taskId, attempt:attempt + 1, correction, maxRisk:step.risk })),
          delayReject(remaining)
        ]);
        const normalized = {
          ok:Boolean(raw?.ok), role:step.role, summary:safeSummary(raw?.summary || ''),
          evidenceRefs:evidenceRefs(raw?.evidenceRefs), usage:usageOf(raw), retryable:raw?.retryable !== false,
          error:raw?.ok ? null : safeSummary(raw?.error || 'agent_failed'), attempts:attempt + 1
        };
        this.#consumeUsage(usage, normalized.usage);
        const outputGuardrail = this.agentic.inspectOutput(normalized, { stage:'tool_output', trace });
        if (!outputGuardrail.ok) {
          this.traces.finishSpan(trace, span, { status:'blocked', attributes:{ tripwire:outputGuardrail.tripwire } });
          return { ...normalized, ok:false, blocked:true, error:`guardrail:${outputGuardrail.tripwire || outputGuardrail.status}` };
        }
        if (normalized.ok) {
          const inbound = this.handoffs.create({
            from:step.role, to:AgentRole.SUPERVISOR, reason:'subtask_result', summary:normalized.summary || `${step.role} completed`,
            requiredRisk:RiskLevel.READ_ONLY, taskId, trace, context:{ attempts:normalized.attempts }, evidenceRefs:normalized.evidenceRefs
          });
          if (!inbound.accepted) {
            this.traces.finishSpan(trace, span, { status:'blocked', attributes:{ reason:inbound.reason } });
            return { ...normalized, ok:false, blocked:true, error:`return_handoff:${inbound.reason}` };
          }
          this.traces.finishSpan(trace, span, { status:'ok', attributes:{ attempts:normalized.attempts } });
          return normalized;
        }
        lastError = normalized.error || lastError;
        this.traces.finishSpan(trace, span, { status:'error', attributes:{ error:lastError } });
        if (!normalized.retryable) break;
      } catch (error) {
        lastError = safeSummary(error?.message || error || 'agent_exception');
        this.traces.finishSpan(trace, span, { status:'error', attributes:{ error:lastError } });
      }
    }
    return { ok:false, role:step.role, error:lastError, retryable:false, attempts:budget.maxRetriesPerStep + 1, evidenceRefs:[], usage:{ toolCalls:0, tokens:0, costUsd:0 } };
  }

  async #verify({ goal, taskId, trace, results, usage, budget, startedAt, round }) {
    const violation = this.#timeViolation(startedAt, budget);
    if (violation) return { ok:false, summary:violation, findings:[{ code:violation, severity:'block' }], retryRoles:[], round };

    const request = this.handoffs.create({
      from:AgentRole.SUPERVISOR, to:AgentRole.VERIFIER, reason:'independent_verification',
      summary:'Verify specialist results before task completion.', requiredRisk:RiskLevel.READ_ONLY,
      taskId, trace, context:{ goal:safeSummary(goal, 2400), round, results:results.map((item) => ({ role:item.role, summary:item.summary, evidenceRefs:item.evidenceRefs })) }
    });
    if (!request.accepted) return { ok:false, summary:`verifier_handoff:${request.reason}`, findings:[], retryRoles:[], round };

    let verdict;
    const execute = this.executors.get(AgentRole.VERIFIER);
    if (execute && usage.agentRuns + 1 > budget.maxAgentRuns) return { ok:false, summary:'budget:max_agent_runs', findings:[], retryRoles:[], round };
    const span = this.traces.startSpan(trace, { name:'agent:verifier', kind:'verifier', attributes:{ round } });
    try {
      if (execute) {
        usage.agentRuns += 1;
        const remaining = Math.max(250, Math.min(budget.stepTimeoutMs, budget.timeoutMs - (Date.now() - startedAt)));
        const raw = await Promise.race([
          Promise.resolve(execute({ role:AgentRole.VERIFIER, goal, taskId, results:structuredClone(results), round, maxRisk:RiskLevel.READ_ONLY })),
          delayReject(remaining, 'verifier_timeout')
        ]);
        this.#consumeUsage(usage, usageOf(raw));
        verdict = {
          ok:Boolean(raw?.ok), summary:safeSummary(raw?.summary || ''),
          findings:Array.isArray(raw?.findings) ? raw.findings.slice(0, 24) : [],
          retryRoles:Array.isArray(raw?.retryRoles) ? raw.retryRoles.filter((role) => Object.values(AgentRole).includes(role) && role !== AgentRole.VERIFIER) : [],
          evidenceRefs:evidenceRefs(raw?.evidenceRefs), round
        };
      } else verdict = { ...this.verifier.evaluate({ results, goal, taskId, round }), round };
    } catch (error) {
      verdict = { ok:false, summary:`verifier_error:${safeSummary(error?.message || error)}`, findings:[], retryRoles:[], round };
    }

    const outputGuardrail = this.agentic.inspectOutput(verdict, { stage:'output', trace });
    if (!outputGuardrail.ok) verdict = { ok:false, summary:`verifier_guardrail:${outputGuardrail.tripwire || outputGuardrail.status}`, findings:verdict.findings || [], retryRoles:[], round };

    const response = this.handoffs.create({
      from:AgentRole.VERIFIER, to:AgentRole.SUPERVISOR, reason:'verification_result',
      summary:verdict.summary || (verdict.ok ? 'Verification passed.' : 'Verification rejected.'), requiredRisk:RiskLevel.READ_ONLY,
      taskId, trace, context:{ ok:verdict.ok, round, retryRoles:verdict.retryRoles || [] }, evidenceRefs:verdict.evidenceRefs || []
    });
    if (!response.accepted) verdict = { ...verdict, ok:false, summary:`verifier_return_handoff:${response.reason}`, retryRoles:[] };

    this.traces.event(trace, 'verification', { ok:verdict.ok, round, retryRoles:verdict.retryRoles || [] });
    this.traces.finishSpan(trace, span, { status:verdict.ok ? 'ok' : 'review', attributes:{ round, retryRoles:(verdict.retryRoles || []).length } });
    return verdict;
  }

  #consumeUsage(total, delta) {
    total.toolCalls += delta.toolCalls;
    total.tokens += delta.tokens;
    total.costUsd = Number((total.costUsd + delta.costUsd).toFixed(6));
  }

  #budgetViolation(usage, budget) {
    if (usage.agentRuns > budget.maxAgentRuns) return 'budget:max_agent_runs';
    if (usage.toolCalls > budget.maxToolCalls) return 'budget:max_tool_calls';
    if (usage.tokens > budget.maxTokens) return 'budget:max_tokens';
    if (usage.costUsd > budget.maxCostUsd) return 'budget:max_cost';
    return null;
  }

  #timeViolation(startedAt, budget) { return Date.now() - startedAt > budget.timeoutMs ? 'budget:timeout' : null; }

  snapshot() {
    return {
      executors:[...this.executors.keys()],
      runs:this.runs.slice(-20).map((run) => structuredClone(run))
    };
  }
}

export { normalizeBudget };
