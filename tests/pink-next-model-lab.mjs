import assert from 'node:assert/strict';
import {
  DatasetSensitivity,
  TrainingRecipe,
  TrainingJobStatus,
  ModelStage,
  PinkTrainingStudio
} from '../packages/model-lab/index.mjs';
import { MiniMindAdapter, MINIMIND_UPSTREAM } from '../packages/model-lab/minimind-adapter.mjs';

const studio = new PinkTrainingStudio();
studio.registerAdapter('minimind', new MiniMindAdapter());

const dataset = studio.datasets.register({
  name:'LPS tool-routing pilot',
  version:'1.0',
  purpose:'Teach a small specialist to select safe Pink capabilities.',
  sourceLicense:'LPS-internal',
  provenanceRefs:[{ id:'ev_dataset_1', source:'approved-synthetic-set', type:'dataset', summary:'Synthetic tool-routing examples' }],
  sensitivity:DatasetSensitivity.INTERNAL,
  containsPersonalData:false,
  containsSecrets:false
});

assert.equal(dataset.teacherEligible, true);
assert.throws(() => studio.datasets.register({
  name:'bad dataset',
  purpose:'contains credentials',
  sourceLicense:'internal',
  provenanceRefs:[{ id:'ev_bad' }],
  containsSecrets:true
}), /secrets/);

const job = studio.createJob({
  datasetId:dataset.id,
  recipe:TrainingRecipe.AGENTIC_RL,
  modelName:'pink-tool-router',
  objective:'Select the minimum-risk Pink tool for each bounded task.',
  baseModel:'minimind-3',
  teacherModel:'teacher-large-model',
  parameters:{ algorithm:'cispo', epochs:1 }
});
assert.equal(job.status, TrainingJobStatus.PLANNED);
assert.equal(job.approvalRequired, true);
assert.throws(() => studio.exportExecutorSpec(job.id, 'minimind'), /approval/);

const ready = studio.approveJob(job.id, { approvalRef:'human-approval-v18-pilot', approvedBy:'Paulo' });
assert.equal(ready.status, TrainingJobStatus.READY);

const spec = studio.exportExecutorSpec(job.id, 'minimind');
assert.equal(spec.execute, false);
assert.equal(spec.entrypoint, 'trainer/train_agent.py');
assert.equal(spec.parameters.algorithm, 'cispo');
assert.equal(spec.upstream.revision, MINIMIND_UPSTREAM.revision);
assert.equal(spec.upstream.license, 'Apache-2.0');

const completed = studio.recordResult(job.id, {
  artifactRef:'artifact://pink-tool-router/candidate-001',
  metrics:{ accuracy:0.81, unsafeToolRate:0.0 },
  evidenceRefs:[{ id:'ev_eval_1', source:'offline-eval', type:'benchmark', summary:'Pilot offline benchmark' }],
  license:'LPS-internal'
});
assert.equal(completed.job.status, TrainingJobStatus.COMPLETED);
assert.equal(completed.model.stage, ModelStage.CANDIDATE);
assert.throws(() => studio.models.promote(completed.model.id, ModelStage.RELEASED), /approvalRef/);

const released = studio.models.promote(completed.model.id, ModelStage.RELEASED, {
  approvalRef:'human-model-release-001',
  evidenceRefs:[{ id:'ev_release_1', source:'human-review', type:'approval', summary:'Release reviewed' }]
});
assert.equal(released.stage, ModelStage.RELEASED);

const restricted = studio.datasets.register({
  name:'Restricted project set',
  purpose:'Private project-only analysis',
  sourceLicense:'LPS-internal',
  provenanceRefs:[{ id:'ev_private_1', source:'project-brain', type:'dataset', summary:'Restricted project data' }],
  sensitivity:DatasetSensitivity.RESTRICTED
});
assert.equal(restricted.teacherEligible, false);
assert.throws(() => studio.createJob({
  datasetId:restricted.id,
  recipe:TrainingRecipe.DISTILLATION,
  modelName:'restricted-model',
  objective:'Private specialist',
  teacherModel:'external-teacher'
}), /not eligible/);

console.log('Pink V18 Training Studio + MiniMind adapter contracts: PASS');
