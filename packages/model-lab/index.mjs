import { RiskLevel, makeId } from '../contracts/index.mjs';
import { containsSecretLike, redactSecretLike } from '../guardrails/index.mjs';

export const DatasetSensitivity = Object.freeze({
  PUBLIC:'public',
  INTERNAL:'internal',
  CONFIDENTIAL:'confidential',
  RESTRICTED:'restricted'
});

export const TrainingRecipe = Object.freeze({
  TOKENIZER:'tokenizer',
  PRETRAIN:'pretrain',
  SFT:'sft',
  LORA:'lora',
  DPO:'dpo',
  PPO:'ppo',
  GRPO:'grpo',
  DISTILLATION:'distillation',
  AGENTIC_RL:'agentic_rl'
});

export const TrainingJobStatus = Object.freeze({
  PLANNED:'planned',
  READY:'ready_for_executor',
  COMPLETED:'completed',
  FAILED:'failed',
  BLOCKED:'blocked'
});

export const ModelStage = Object.freeze({
  CANDIDATE:'candidate',
  VALIDATED:'validated',
  RELEASED:'released'
});

const ALLOWED_RECIPES = new Set(Object.values(TrainingRecipe));
const ALLOWED_SENSITIVITY = new Set(Object.values(DatasetSensitivity));

function clone(value) { return structuredClone(value); }
function text(value, max = 1200) {
  const out = String(value ?? '').trim();
  return out.length > max ? `${out.slice(0, max)}…[truncated]` : out;
}

function normalizeRefs(refs = [], max = 24) {
  if (!Array.isArray(refs)) return [];
  return refs.slice(0, max).map((ref) => {
    if (typeof ref === 'string') return { id:text(ref, 320) };
    if (!ref || typeof ref !== 'object') return null;
    return {
      id:text(ref.id || '', 240),
      source:text(ref.source || '', 500),
      type:text(ref.type || '', 100),
      summary:text(ref.summary || '', 800),
      sha:text(ref.sha || '', 120)
    };
  }).filter((ref) => ref && (ref.id || ref.source));
}

function normalizeParameters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const clean = redactSecretLike(input);
  return Object.fromEntries(Object.entries(clean).slice(0, 80));
}

export class DatasetRegistry {
  constructor() { this.datasets = new Map(); }

  register(input = {}) {
    const name = text(input.name, 180);
    const version = text(input.version || '1', 80);
    const purpose = text(input.purpose, 1200);
    const sourceLicense = text(input.sourceLicense, 180);
    const provenanceRefs = normalizeRefs(input.provenanceRefs);
    const sensitivity = input.sensitivity || DatasetSensitivity.INTERNAL;

    if (!name || !purpose) throw new TypeError('dataset requires name and purpose');
    if (!sourceLicense) throw new TypeError('dataset requires sourceLicense');
    if (!provenanceRefs.length) throw new TypeError('dataset requires provenanceRefs');
    if (!ALLOWED_SENSITIVITY.has(sensitivity)) throw new TypeError('invalid dataset sensitivity');
    if (input.containsSecrets === true) throw new Error('datasets containing secrets cannot be registered for training');
    if (containsSecretLike({ name, purpose, sourceLicense, provenanceRefs })) throw new Error('secret-like value detected in dataset metadata');

    const dataset = Object.freeze({
      id:input.id ? text(input.id, 240) : makeId('dataset'),
      name, version, purpose, sourceLicense, provenanceRefs:Object.freeze(provenanceRefs),
      sensitivity,
      containsPersonalData:Boolean(input.containsPersonalData),
      containsSecrets:false,
      teacherEligible:!input.containsPersonalData && sensitivity !== DatasetSensitivity.RESTRICTED,
      createdAt:new Date().toISOString()
    });
    this.datasets.set(dataset.id, dataset);
    return clone(dataset);
  }

  get(id) { const value = this.datasets.get(id); return value ? clone(value) : null; }
  list() { return [...this.datasets.values()].map(clone); }
}

export class ModelRegistry {
  constructor() { this.models = new Map(); }

  register(input = {}) {
    const name = text(input.name, 180);
    const artifactRef = text(input.artifactRef, 600);
    const evidenceRefs = normalizeRefs(input.evidenceRefs);
    if (!name || !artifactRef) throw new TypeError('model requires name and artifactRef');
    if (!evidenceRefs.length) throw new TypeError('model requires evidenceRefs');

    const model = {
      id:input.id ? text(input.id, 240) : makeId('model'),
      name,
      version:text(input.version || '0.1.0', 80),
      stage:ModelStage.CANDIDATE,
      task:text(input.task || '', 500),
      recipe:text(input.recipe || '', 80),
      baseModel:text(input.baseModel || '', 320) || null,
      adapter:text(input.adapter || '', 120) || null,
      artifactRef,
      metrics:normalizeParameters(input.metrics || {}),
      evidenceRefs,
      license:text(input.license || '', 180) || null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    this.models.set(model.id, model);
    return clone(model);
  }

  promote(id, stage, { approvalRef = null, evidenceRefs = [] } = {}) {
    const model = this.models.get(id);
    if (!model) throw new Error('model not found');
    if (!Object.values(ModelStage).includes(stage)) throw new TypeError('invalid model stage');
    const order = [ModelStage.CANDIDATE, ModelStage.VALIDATED, ModelStage.RELEASED];
    if (order.indexOf(stage) < order.indexOf(model.stage)) throw new Error('model stage cannot move backwards');
    if (stage === ModelStage.RELEASED && !text(approvalRef, 320)) throw new Error('release requires explicit approvalRef');
    const extraEvidence = normalizeRefs(evidenceRefs);
    if (stage !== ModelStage.CANDIDATE && !(model.evidenceRefs.length || extraEvidence.length)) throw new Error('promotion requires evidence');
    model.stage = stage;
    model.evidenceRefs = [...model.evidenceRefs, ...extraEvidence].slice(-32);
    model.approvalRef = approvalRef ? text(approvalRef, 320) : model.approvalRef || null;
    model.updatedAt = new Date().toISOString();
    return clone(model);
  }

  get(id) { const value = this.models.get(id); return value ? clone(value) : null; }
  list() { return [...this.models.values()].map(clone); }
}

export class PinkTrainingStudio {
  constructor({ datasets = null, models = null } = {}) {
    this.datasets = datasets || new DatasetRegistry();
    this.models = models || new ModelRegistry();
    this.adapters = new Map();
    this.jobs = new Map();
  }

  registerAdapter(id, adapter) {
    const key = text(id, 120);
    if (!key || !adapter || typeof adapter.buildExecutorSpec !== 'function') throw new TypeError('adapter requires id and buildExecutorSpec');
    this.adapters.set(key, adapter);
    return this;
  }

  createJob(input = {}) {
    const dataset = this.datasets.get(input.datasetId);
    if (!dataset) throw new Error('dataset not found');
    const recipe = text(input.recipe, 80);
    if (!ALLOWED_RECIPES.has(recipe)) throw new TypeError('unsupported training recipe');
    const modelName = text(input.modelName, 180);
    const objective = text(input.objective, 1600);
    if (!modelName || !objective) throw new TypeError('training job requires modelName and objective');

    const parameters = normalizeParameters(input.parameters || {});
    if (containsSecretLike(parameters)) throw new Error('training parameters contain secret-like values');

    const teacherModel = text(input.teacherModel || '', 320) || null;
    if (teacherModel && !dataset.teacherEligible) {
      throw new Error('dataset is not eligible for external teacher use');
    }

    const job = {
      id:makeId('train'),
      datasetId:dataset.id,
      recipe,
      modelName,
      objective,
      baseModel:text(input.baseModel || '', 320) || null,
      teacherModel,
      parameters,
      status:TrainingJobStatus.PLANNED,
      risk:RiskLevel.MEDIUM,
      approvalRequired:true,
      approvalRef:null,
      executorSpec:null,
      result:null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    this.jobs.set(job.id, job);
    return clone(job);
  }

  approveJob(id, { approvalRef, approvedBy = 'human' } = {}) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('training job not found');
    const ref = text(approvalRef, 320);
    if (!ref) throw new Error('training approval requires approvalRef');
    job.status = TrainingJobStatus.READY;
    job.approvalRef = ref;
    job.approvedBy = text(approvedBy, 180) || 'human';
    job.updatedAt = new Date().toISOString();
    return clone(job);
  }

  exportExecutorSpec(id, adapterId = 'minimind') {
    const job = this.jobs.get(id);
    if (!job) throw new Error('training job not found');
    if (job.status !== TrainingJobStatus.READY) throw new Error('training job requires approval before executor export');
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error('training adapter not registered');
    const dataset = this.datasets.get(job.datasetId);
    const spec = adapter.buildExecutorSpec(clone(job), dataset);
    if (!spec || spec.execute !== false) throw new Error('adapter executor spec must be non-executing');
    job.executorSpec = clone(spec);
    job.updatedAt = new Date().toISOString();
    return clone(spec);
  }

  recordResult(id, input = {}) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('training job not found');
    if (job.status !== TrainingJobStatus.READY) throw new Error('training job is not ready for result recording');
    const artifactRef = text(input.artifactRef, 600);
    const evidenceRefs = normalizeRefs(input.evidenceRefs);
    if (!artifactRef || !evidenceRefs.length) throw new Error('training result requires artifactRef and evidenceRefs');

    job.status = TrainingJobStatus.COMPLETED;
    job.result = {
      artifactRef,
      metrics:normalizeParameters(input.metrics || {}),
      evidenceRefs,
      completedAt:new Date().toISOString()
    };
    job.updatedAt = new Date().toISOString();

    const model = this.models.register({
      name:job.modelName,
      task:job.objective,
      recipe:job.recipe,
      baseModel:job.baseModel,
      adapter:job.executorSpec?.adapter || null,
      artifactRef,
      metrics:job.result.metrics,
      evidenceRefs,
      license:text(input.license || '', 180) || null
    });
    job.result.modelId = model.id;
    return { job:clone(job), model };
  }

  failJob(id, reason) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('training job not found');
    job.status = TrainingJobStatus.FAILED;
    job.failureReason = text(reason || 'unknown', 1200);
    job.updatedAt = new Date().toISOString();
    return clone(job);
  }

  getJob(id) { const value = this.jobs.get(id); return value ? clone(value) : null; }
  listJobs() { return [...this.jobs.values()].map(clone); }

  snapshot() {
    return {
      adapters:[...this.adapters.keys()],
      datasets:this.datasets.list(),
      models:this.models.list(),
      jobs:this.listJobs()
    };
  }
}
