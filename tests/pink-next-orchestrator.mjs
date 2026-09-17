import assert from 'node:assert/strict';
import { TaskStatus } from '../packages/contracts/index.mjs';
import { AgentRole } from '../packages/agents/index.mjs';
import { TaskRuntime } from '../packages/task-runtime/index.mjs';
import { TraceStore } from '../packages/observability/index.mjs';
import { createDefaultGuardrails } from '../packages/guardrails/index.mjs';
import { HandoffBroker } from '../packages/handoffs/index.mjs';
import { AgenticExecutionKernel, PermissionProfile } from '../packages/agentic-runtime/index.mjs';
import { MultiAgentOrchestrator, OrchestrationStatus } from '../packages/orchestrator/index.mjs';

function createStack() {
  const taskRuntime = new TaskRuntime();
  const traces = new TraceStore();
  const guardrails = createDefaultGuardrails();
  const handoffs = new HandoffBroker({ guardrails, traces });
  const security = {
    constraints:{ evaluate:() => ({ allowed:true, hits:[] }) },
    approvals:{ consume:() => ({ ok:true }) }
  };
  const agentic = new AgenticExecutionKernel({
    taskRuntime, tools:{ search:() => [] }, security, traces, contextCompiler:{}, memory:{},
    profile:PermissionProfile.DEVELOPER, guardrails, handoffs
  });
  const orchestrator = new MultiAgentOrchestrator({ agentic, handoffs, traces, taskRuntime });
  return { taskRuntime, traces, handoffs, orchestrator };
}

const stack = createStack();
const plan = stack.orchestrator.plan('Pesquise na web, revise segurança e implemente código no GitHub');
assert.equal(plan.waves[0].parallel, true);
assert.deepEqual(plan.waves[0].steps.map((step) => step.role), [AgentRole.RESEARCH, AgentRole.SECURITY]);
assert.equal(plan.waves[1].parallel, false);
assert.equal(plan.waves[1].steps[0].role, AgentRole.DEVELOPER);

let developerCalls = 0;
let verifierCalls = 0;
stack.orchestrator
  .register(AgentRole.RESEARCH, async () => ({ ok:true, summary:'Current sources reviewed.', evidenceRefs:[{ id:'ev_research', type:'source', source:'docs', summary:'current docs' }] }))
  .register(AgentRole.SECURITY, async () => ({ ok:true, summary:'Security boundary reviewed.', evidenceRefs:[{ id:'ev_security', type:'review', source:'policy', summary:'risk reviewed' }] }))
  .register(AgentRole.DEVELOPER, async () => {
    developerCalls += 1;
    if (developerCalls === 1) throw new Error('transient development failure');
    return { ok:true, summary:`Isolated implementation prepared #${developerCalls}.`, evidenceRefs:[{ id:`ev_dev_${developerCalls}`, type:'commit', source:'git', summary:'isolated change' }] };
  })
  .register(AgentRole.VERIFIER, async () => {
    verifierCalls += 1;
    if (verifierCalls === 1) return { ok:false, summary:'One revision required.', retryRoles:[AgentRole.DEVELOPER], findings:[{ code:'revision', severity:'block' }] };
    return { ok:true, summary:'Independent verification passed.', findings:[], retryRoles:[], evidenceRefs:[{ id:'ev_verify', type:'verification', source:'verifier', summary:'accepted after revision' }] };
  });

const result = await stack.orchestrator.run('Pesquise na web, revise segurança e implemente código no GitHub', {
  budget:{ maxAgentRuns:10, maxRetriesPerStep:1, maxVerificationRounds:1, timeoutMs:30000, stepTimeoutMs:5000 }
});
assert.equal(result.status, OrchestrationStatus.COMPLETED);
assert.equal(result.task.status, TaskStatus.COMPLETED);
assert.equal(developerCalls, 3);
assert.equal(verifierCalls, 2);
assert.equal(result.verification.ok, true);
assert.equal(result.verification.round, 1);
assert.ok(result.usage.agentRuns >= 7);
assert.ok(stack.handoffs.snapshot().accepted >= 10);
const completedTrace = stack.traces.list().find((trace) => trace.id === result.traceId);
assert.equal(completedTrace.success, true);
assert.equal(completedTrace.events.filter((event) => event.type === 'verification').length, 2);
assert.ok(completedTrace.spans.some((span) => span.kind === 'verifier'));

const limited = createStack();
let limitedRuns = 0;
limited.orchestrator
  .register(AgentRole.RESEARCH, async () => { limitedRuns += 1; return { ok:true, summary:'research' }; })
  .register(AgentRole.SECURITY, async () => { limitedRuns += 1; return { ok:true, summary:'security' }; });
const blocked = await limited.orchestrator.run('Pesquise na web e revise segurança', { budget:{ maxAgentRuns:1, timeoutMs:10000 } });
assert.equal(blocked.status, OrchestrationStatus.BLOCKED);
assert.equal(blocked.reason, 'budget:max_agent_runs');
assert.equal(blocked.task.status, TaskStatus.BLOCKED);
assert.equal(limitedRuns, 0);

console.log('Pink Next V16 multi-agent orchestrator contracts: PASS');
