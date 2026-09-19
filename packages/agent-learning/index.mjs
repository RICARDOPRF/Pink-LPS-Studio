import { RiskLevel, makeId } from '../contracts/index.mjs';
import { containsSecretLike, redactSecretLike } from '../guardrails/index.mjs';

export const LearningPlanStatus = Object.freeze({
  PLANNED:'planned',
  APPROVED:'approved',
  SPEC_READY:'spec_ready',
  EVALUATED:'evaluated',
  PROMOTION_APPROVED:'promotion_approved',
  BLOCKED:'blocked'
});

export const TrajectoryOutcome = Object.freeze({
  SUCCEEDED:'succeeded',
  FAILED:'failed',
  TIMEOUT:'timeout',
  CANCELLED:'cancelled'
});

export const TraceAggregationLevel = Object.freeze({
  TRAJECTORY:'trajectory',
  TRANSITION:'transition'
});

const OUTCOMES = new Set(Object.values(TrajectoryOutcome));
const AGGREGATION_LEVELS = new Set(Object.values(TraceAggregationLevel));
const OPTIMIZATION_TARGETS = new Set(['prompt','tools','workflow','model','reasoning']);

function clone(value) { return structuredClone(value); }
function text(value, max = 1200) {
  const out = String(value ?? '').trim();
  return out.length > max ? `${out.slice(0, max)}…[truncated]` : out;
}
function refs(items = [], max = 24) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, max).map((item) => {
    if (typeof item === 'string') return { id:text(item, 320) };
    if (!item || typeof item !== 'object') return null;
    return {
      id:text(item.id || '', 240),
      source:text(item.source || '', 500),
      type:text(item.type || '', 100),
      summary:text(item.summary || '', 800),
      sha:text(item.sha || '', 120)
    };
  }).filter((item) => item && (item.id || item.source));
}
function cleanMap(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const clean = redactSecretLike(input);
  return Object.fromEntries(Object.entries(clean).slice(0, 64));
}
function numericMap(input = {}) {
  const clean = cleanMap(input);
  return Object.fromEntries(Object.entries(clean).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => [text(key, 120), Number(value)]));
}
function iso(value = new Date().toISOString()) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError('invalid date');
  return parsed.toISOString();
}

export class AgentHarnessRegistry {
  constructor() { this.harnesses = new Map(); }

  register(input = {}) {
    const name = text(input.name, 180);
    const version = text(input.version || '1', 80);
    const evidenceRefs = refs(input.evidenceRefs);
    if (!name) throw new TypeError('agent harness requires name');
    if (!evidenceRefs.length) throw new TypeError('agent harness requires evidenceRefs');

    const harness = Object.freeze({
      id:input.id ? text(input.id, 240) : makeId('harness'),
      name,
      version,
      projectId:text(input.projectId || '', 180) || null,
      entrypointRef:text(input.entrypointRef || '', 600) || null,
      capabilities:Object.freeze((input.capabilities || []).slice(0, 32).map((x) => text(x, 120)).filter(Boolean)),
      evidenceRefs:Object.freeze(evidenceRefs),
      metadata:Object.freeze(cleanMap(input.metadata || {})),
      createdAt:new Date().toISOString()
    });
    if (containsSecretLike(harness)) throw new Error('secret-like agent harness metadata rejected');
    this.harnesses.set(harness.id, harness);
    return clone(harness);
  }

  get(id) { const value = this.harnesses.get(id); return value ? clone(value) : null; }
  list() { return [...this.harnesses.values()].map(clone); }
}

export class BenchmarkRegistry {
  constructor() { this.benchmarks = new Map(); }

  register(input = {}) {
    const name = text(input.name, 180);
    const datasetRef = text(input.datasetRef, 600);
    const evidenceRefs = refs(input.evidenceRefs);
    if (!name || !datasetRef) throw new TypeError('benchmark requires name and datasetRef');
    if (!evidenceRefs.length) throw new TypeError('benchmark requires evidenceRefs');

    const benchmark = Object.freeze({
      id:input.id ? text(input.id, 240) : makeId('benchmark'),
      name,
      version:text(input.version || '1', 80),
      projectId:text(input.projectId || '', 180) || null,
      datasetRef,
      metrics:Object.freeze((input.metrics || []).slice(0, 24).map((x) => text(x, 120)).filter(Boolean)),
      baseline:Object.freeze(numericMap(input.baseline || {})),
      evidenceRefs:Object.freeze(evidenceRefs),
      createdAt:new Date().toISOString()
    });
    if (containsSecretLike(benchmark)) throw new Error('secret-like benchmark metadata rejected');
    this.benchmarks.set(benchmark.id, benchmark);
    return clone(benchmark);
  }

  get(id) { const value = this.benchmarks.get(id); return value ? clone(value) : null; }
  list() { return [...this.benchmarks.values()].map(clone); }
}

export class TrajectoryRegistry {
  constructor({ harnesses, benchmarks } = {}) {
    this.harnesses = harnesses;
    this.benchmarks = benchmarks;
    this.trajectories = new Map();
  }

  record(input = {}) {
    const harness = this.harnesses?.get(input.harnessId);
    if (!harness) throw new Error('trajectory harness not found');
    const benchmark = input.benchmarkId ? this.benchmarks?.get(input.benchmarkId) : null;
    if (input.benchmarkId && !benchmark) throw new Error('trajectory benchmark not found');
    if (harness.projectId && benchmark?.projectId && harness.projectId !== benchmark.projectId) throw new Error('cross-project trajectory blocked');

    const outcome = input.outcome || TrajectoryOutcome.SUCCEEDED;
    if (!OUTCOMES.has(outcome)) throw new TypeError('invalid trajectory outcome');
    const traceRef = text(input.traceRef, 600);
    const evidenceRefs = refs(input.evidenceRefs);
    if (!traceRef || !evidenceRefs.length) throw new TypeError('trajectory requires traceRef and evidenceRefs');

    const startedAt = iso(input.startedAt || new Date().toISOString());
    const finishedAt = iso(input.finishedAt || startedAt);
    if (new Date(finishedAt).getTime() < new Date(startedAt).getTime()) throw new Error('trajectory finishedAt precedes startedAt');

    const trajectory = Object.freeze({
      id:input.id ? text(input.id, 240) : makeId('trajectory'),
      harnessId:harness.id,
      benchmarkId:benchmark?.id || null,
      projectId:harness.projectId || benchmark?.projectId || null,
      traceRef,
      outcome,
      score:Number.isFinite(Number(input.score)) ? Number(input.score) : null,
      rewardSignals:Object.freeze(numericMap(input.rewardSignals || {})),
      policyRef:text(input.policyRef || '', 600) || null,
      evidenceRefs:Object.freeze(evidenceRefs),
      startedAt,
      finishedAt,
      recordedAt:new Date().toISOString()
    });
    if (containsSecretLike(trajectory)) throw new Error('secret-like trajectory metadata rejected');
    this.trajectories.set(trajectory.id, trajectory);
    return clone(trajectory);
  }

  get(id) { const value = this.trajectories.get(id); return value ? clone(value) : null; }
  list() { return [...this.trajectories.values()].map(clone); }
}

export class PinkAgentLearningStudio {
  constructor({ harnesses = null, benchmarks = null, trajectories = null } = {}) {
    this.harnesses = harnesses || new AgentHarnessRegistry();
    this.benchmarks = benchmarks || new BenchmarkRegistry();
    this.trajectories = trajectories || new TrajectoryRegistry({ harnesses:this.harnesses, benchmarks:this.benchmarks });
    this.adapters = new Map();
    this.plans = new Map();
  }

  registerAdapter(id, adapter) {
    const key = text(id, 120);
    if (!key || !adapter || typeof adapter.buildExecutorSpec !== 'function') throw new TypeError('agent learning adapter invalid');
    this.adapters.set(key, adapter);
    return this;
  }

  createPlan(input = {}) {
    const harness = this.harnesses.get(input.harnessId);
    const benchmark = this.benchmarks.get(input.benchmarkId);
    if (!harness || !benchmark) throw new Error('learning plan requires registered harness and benchmark');
    if (harness.projectId && benchmark.projectId && harness.projectId !== benchmark.projectId) throw new Error('cross-project learning plan blocked');

    const objective = text(input.objective, 1800);
    if (!objective) throw new TypeError('learning plan requires objective');
    const trajectoryIds = [...new Set((input.trajectoryIds || []).slice(0, 256).map((x) => text(x, 240)).filter(Boolean))];
    for (const id of trajectoryIds) {
      const trajectory = this.trajectories.get(id);
      if (!trajectory) throw new Error('learning plan trajectory not found');
      if (trajectory.harnessId !== harness.id) throw new Error('trajectory belongs to another harness');
    }

    const optimizationTargets = [...new Set((input.optimizationTargets || ['prompt','tools','workflow']).slice(0, 8).map((x) => text(x, 80)))];
    if (!optimizationTargets.length || optimizationTargets.some((x) => !OPTIMIZATION_TARGETS.has(x))) throw new TypeError('invalid optimization target');

    const aggregationLevel = input.aggregationLevel || TraceAggregationLevel.TRAJECTORY;
    if (!AGGREGATION_LEVELS.has(aggregationLevel)) throw new TypeError('invalid trace aggregation level');

    const plan = {
      id:makeId('agentlearn'),
      harnessId:harness.id,
      benchmarkId:benchmark.id,
      projectId:harness.projectId || benchmark.projectId || null,
      objective,
      trajectoryIds,
      optimizationTargets,
      aggregationLevel,
      status:LearningPlanStatus.PLANNED,
      risk:RiskLevel.HIGH,
      approvalRequired:true,
      approvalRef:null,
      executorSpec:null,
      evaluation:null,
      promotionApprovalRef:null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    this.plans.set(plan.id, plan);
    return clone(plan);
  }

  approvePlan(id, { approvalRef, approvedBy = 'human' } = {}) {
    const plan = this.plans.get(id);
    if (!plan) throw new Error('learning plan not found');
    const ref = text(approvalRef, 320);
    if (!ref) throw new Error('learning plan approval requires approvalRef');
    plan.status = LearningPlanStatus.APPROVED;
    plan.approvalRef = ref;
    plan.approvedBy = text(approvedBy, 180) || 'human';
    plan.updatedAt = new Date().toISOString();
    return clone(plan);
  }

  exportExecutorSpec(id, adapterId = 'agent-lightning') {
    const plan = this.plans.get(id);
    if (!plan) throw new Error('learning plan not found');
    if (plan.status !== LearningPlanStatus.APPROVED && plan.status !== LearningPlanStatus.SPEC_READY) throw new Error('learning plan requires approval before executor export');
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error('agent learning adapter not registered');

    const context = {
      harness:this.harnesses.get(plan.harnessId),
      benchmark:this.benchmarks.get(plan.benchmarkId),
      trajectories:plan.trajectoryIds.map((id) => this.trajectories.get(id)).filter(Boolean)
    };
    const spec = adapter.buildExecutorSpec(clone(plan), context);
    if (!spec || spec.execute !== false) throw new Error('agent learning executor spec must be non-executing');
    plan.executorSpec = clone(spec);
    plan.status = LearningPlanStatus.SPEC_READY;
    plan.updatedAt = new Date().toISOString();
    return clone(spec);
  }

  recordEvaluation(id, input = {}) {
    const plan = this.plans.get(id);
    if (!plan) throw new Error('learning plan not found');
    if (plan.status !== LearningPlanStatus.SPEC_READY) throw new Error('learning plan requires executor spec before evaluation');
    const candidateRef = text(input.candidateRef, 600);
    const evidenceRefs = refs(input.evidenceRefs);
    if (!candidateRef || !evidenceRefs.length) throw new Error('learning evaluation requires candidateRef and evidenceRefs');

    plan.evaluation = {
      candidateRef,
      metrics:numericMap(input.metrics || {}),
      evidenceRefs,
      notes:text(input.notes || '', 1600) || null,
      evaluatedAt:new Date().toISOString()
    };
    plan.status = LearningPlanStatus.EVALUATED;
    plan.updatedAt = new Date().toISOString();
    return clone(plan);
  }

  approvePromotion(id, { approvalRef, evidenceRefs = [] } = {}) {
    const plan = this.plans.get(id);
    if (!plan) throw new Error('learning plan not found');
    if (plan.status !== LearningPlanStatus.EVALUATED) throw new Error('learning plan must be evaluated before promotion approval');
    const ref = text(approvalRef, 320);
    if (!ref) throw new Error('promotion requires explicit approvalRef');
    const extraEvidence = refs(evidenceRefs);
    plan.promotionApprovalRef = ref;
    plan.promotionEvidenceRefs = extraEvidence;
    plan.status = LearningPlanStatus.PROMOTION_APPROVED;
    plan.updatedAt = new Date().toISOString();
    return clone(plan);
  }

  getPlan(id) { const value = this.plans.get(id); return value ? clone(value) : null; }
  listPlans() { return [...this.plans.values()].map(clone); }

  snapshot() {
    return {
      adapters:[...this.adapters.keys()],
      harnesses:this.harnesses.list(),
      benchmarks:this.benchmarks.list(),
      trajectories:this.trajectories.list(),
      plans:this.listPlans()
    };
  }
}
