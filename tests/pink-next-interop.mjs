import assert from 'node:assert/strict';
import { RiskLevel } from '../packages/contracts/index.mjs';
import { AgentRole } from '../packages/agents/index.mjs';
import { GuardrailStage, createDefaultGuardrails } from '../packages/guardrails/index.mjs';
import { HandoffBroker } from '../packages/handoffs/index.mjs';
import { TraceStore } from '../packages/observability/index.mjs';
import { AgenticExecutionKernel, PermissionProfile } from '../packages/agentic-runtime/index.mjs';

const guardrails = createDefaultGuardrails();
const fakeBearer = `Bearer ${'a'.repeat(32)}`;
const fakeApiKey = `sk-${'b'.repeat(32)}`;
assert.equal(guardrails.evaluate(GuardrailStage.TOOL_INPUT, { sourceTrust:'untrusted', risk:RiskLevel.LOW }).status, 'block');
assert.equal(guardrails.evaluate(GuardrailStage.TOOL_INPUT, { sourceTrust:'untrusted', risk:RiskLevel.READ_ONLY }).status, 'pass');
assert.equal(guardrails.evaluate(GuardrailStage.OUTPUT, { payload:fakeBearer }).status, 'block');

const traces = new TraceStore();
const trace = traces.start({ taskId:'task_v15', goal:'handoff test', variant:'candidate' });
const rootSpan = traces.startSpan(trace, { name:'agent-run', kind:'agent' });
const childSpan = traces.startSpan(trace, { name:'handoff', kind:'handoff', parentId:rootSpan.id });
traces.finishSpan(trace, childSpan, { status:'ok' });
traces.finishSpan(trace, rootSpan, { status:'ok' });

const handoffs = new HandoffBroker({ guardrails, traces });
const accepted = handoffs.create({
  from:AgentRole.SUPERVISOR, to:AgentRole.DEVELOPER, reason:'implementation', summary:'Prepare isolated change.', requiredRisk:RiskLevel.MEDIUM,
  taskId:'task_v15', trace,
  context:{ apiKey:fakeApiKey, history:['raw transcript must not move'], file:'safe.js' },
  evidenceRefs:[{ id:'ev_1', type:'test', source:'ci', summary:'green baseline' }]
});
assert.equal(accepted.accepted, true);
assert.equal(accepted.envelope.context.apiKey, '[REDACTED_SECRET]');
assert.equal(accepted.envelope.context.history, '[OMITTED_HANDOFF_CONTEXT]');
assert.equal(accepted.envelope.evidenceRefs[0].id, 'ev_1');

const deniedRoute = handoffs.create({ from:AgentRole.RESEARCH, to:AgentRole.DESKTOP, reason:'direct desktop', summary:'Do it', requiredRisk:RiskLevel.READ_ONLY });
assert.equal(deniedRoute.accepted, false);
assert.equal(deniedRoute.reason, 'route_not_allowed');

const deniedRisk = handoffs.create({ from:AgentRole.SUPERVISOR, to:AgentRole.RESEARCH, reason:'write request', summary:'Mutate external system', requiredRisk:RiskLevel.MEDIUM });
assert.equal(deniedRisk.accepted, false);
assert.equal(deniedRisk.reason, 'destination_risk_cap');

const security = {
  constraints:{ evaluate:() => ({ allowed:true, hits:[] }) },
  approvals:{ consume:() => ({ ok:true }) }
};
const kernel = new AgenticExecutionKernel({
  taskRuntime:{ create:({ goal, plan, metadata }) => ({ id:'task_kernel', goal, plan, metadata }), checkpoint:() => ({}) },
  tools:{ search:() => [] }, security, traces, contextCompiler:{}, memory:{}, profile:PermissionProfile.DEVELOPER, guardrails, handoffs
});
const blocked = kernel.authorize({ action:'github.write', role:AgentRole.DEVELOPER, manifestRisk:RiskLevel.LOW, sourceTrust:'untrusted', trace });
assert.equal(blocked.allowed, false);
assert.equal(blocked.reason, 'guardrail');
const readOnly = kernel.authorize({ action:'github.read', role:AgentRole.DEVELOPER, manifestRisk:RiskLevel.READ_ONLY, sourceTrust:'untrusted', trace });
assert.equal(readOnly.allowed, true);

const finished = traces.finish(trace, { success:true });
assert.equal(finished.metrics.handoffs >= 1, true);
assert.equal(finished.metrics.guardrailTrips >= 1, true);
assert.equal(finished.metrics.spans, 2);
assert.equal(handoffs.snapshot().accepted, 1);
assert.equal(handoffs.snapshot().rejected, 2);

console.log('Pink Next handoff, guardrail and trace-span contracts: PASS');
