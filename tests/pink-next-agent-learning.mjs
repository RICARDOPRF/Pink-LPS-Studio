import assert from 'node:assert/strict';
import {
  PinkAgentLearningStudio,
  LearningPlanStatus,
  TrajectoryOutcome,
  TraceAggregationLevel
} from '../packages/agent-learning/index.mjs';
import { AgentLightningAdapter, AGENT_LIGHTNING_UPSTREAM } from '../packages/agent-learning/agent-lightning-adapter.mjs';

const studio = new PinkAgentLearningStudio();
studio.registerAdapter('agent-lightning', new AgentLightningAdapter());

const harness = studio.harnesses.register({
  id:'pink-orchestrator-demo',
  name:'Pink Multi-Agent Orchestrator',
  version:'v16',
  projectId:'beccs-demo',
  entrypointRef:'packages/orchestrator/index.mjs',
  capabilities:['planner','executor','reviewer'],
  evidenceRefs:[{ id:'harness-v16', source:'V16 orchestrator contracts', type:'test', summary:'Validated orchestrator harness' }]
});

const benchmark = studio.benchmarks.register({
  id:'benchmark-restrictions',
  name:'Restriction Resolution Benchmark',
  version:'1',
  projectId:'beccs-demo',
  datasetRef:'dataset://approved/restrictions-v1',
  metrics:['success_rate','latency_ms','cost_index'],
  baseline:{ success_rate:0.62, latency_ms:1800, cost_index:1 },
  evidenceRefs:[{ id:'benchmark-001', source:'LPS benchmark manifest', type:'benchmark', summary:'Approved benchmark metadata' }]
});

const trajectory = studio.trajectories.record({
  id:'trajectory-001',
  harnessId:harness.id,
  benchmarkId:benchmark.id,
  traceRef:'trace://pink/v16/restriction-001',
  outcome:TrajectoryOutcome.SUCCEEDED,
  score:0.74,
  rewardSignals:{ task_success:1, evidence_quality:0.9, latency_penalty:-0.1 },
  policyRef:'policy://pink/orchestrator/v16',
  evidenceRefs:[{ id:'trace-001', source:'TraceStore', type:'trace', summary:'Evidence-backed agent rollout' }],
  startedAt:'2026-09-17T18:00:00Z',
  finishedAt:'2026-09-17T18:00:05Z'
});

assert.equal(trajectory.outcome, TrajectoryOutcome.SUCCEEDED);

const plan = studio.createPlan({
  harnessId:harness.id,
  benchmarkId:benchmark.id,
  objective:'Improve restriction-resolution decisions while preserving evidence quality, latency and cost controls.',
  trajectoryIds:[trajectory.id],
  optimizationTargets:['prompt','tools','workflow','reasoning'],
  aggregationLevel:TraceAggregationLevel.TRAJECTORY
});

assert.equal(plan.status, LearningPlanStatus.PLANNED);
assert.throws(() => studio.exportExecutorSpec(plan.id), /requires approval/);

studio.approvePlan(plan.id, { approvalRef:'human-approval-v19-001' });
const spec = studio.exportExecutorSpec(plan.id);

assert.equal(spec.execute, false);
assert.equal(spec.adapter, 'agent-lightning');
assert.equal(spec.upstream.revision, AGENT_LIGHTNING_UPSTREAM.revision);
assert.equal(spec.upstream.version, 'v1.0.1');
assert.equal(spec.upstream.license, 'MIT');
assert.deepEqual(spec.upstream.architecture, ['trainer','api-gateway','rollout-controller']);
assert.equal(spec.runner.localAllowed, false);
assert.equal(spec.runner.kubernetesAllowed, false);
assert.equal(spec.runner.productionHarnessMutationAllowed, false);
assert.equal(spec.network.gatewayConfigured, false);
assert.equal(spec.network.bearerCredentialConfigured, false);
assert.equal(spec.network.modelEndpointConfigured, false);
assert.equal(spec.trajectories.length, 1);

const evaluated = studio.recordEvaluation(plan.id, {
  candidateRef:'candidate://pink/orchestrator/v19-lab-001',
  metrics:{ success_rate:0.71, latency_ms:1720, cost_index:0.97 },
  evidenceRefs:[{ id:'eval-001', source:'V19 isolated benchmark', type:'evaluation', summary:'Candidate benchmark result' }]
});
assert.equal(evaluated.status, LearningPlanStatus.EVALUATED);
assert.throws(() => studio.approvePromotion(plan.id, {}), /approvalRef/);

const promoted = studio.approvePromotion(plan.id, {
  approvalRef:'human-promotion-v19-001',
  evidenceRefs:[{ id:'promotion-review', source:'Human review', type:'approval', summary:'Candidate approved for later controlled promotion' }]
});
assert.equal(promoted.status, LearningPlanStatus.PROMOTION_APPROVED);

const otherHarness = studio.harnesses.register({
  id:'other-harness',
  name:'Other Project Agent',
  projectId:'other-project',
  evidenceRefs:[{ id:'other-harness-proof', source:'test', type:'test', summary:'Other project harness' }]
});
assert.throws(() => studio.trajectories.record({
  harnessId:otherHarness.id,
  benchmarkId:benchmark.id,
  traceRef:'trace://cross-project',
  evidenceRefs:[{ id:'cross-proof', source:'test', type:'test', summary:'Cross project attempt' }]
}), /cross-project/);

console.log('Pink V19 Agent Learning + Agent Lightning adapter contracts: PASS');
