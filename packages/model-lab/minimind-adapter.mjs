import { TrainingRecipe } from './index.mjs';

export const MINIMIND_UPSTREAM = Object.freeze({
  repository:'jingyaogong/minimind',
  revision:'7a9137d2e90294df80ce9178b89e82657e19f5a7',
  license:'Apache-2.0',
  integrationMode:'external-isolated-runner'
});

const ENTRYPOINTS = Object.freeze({
  [TrainingRecipe.TOKENIZER]:'trainer/train_tokenizer.py',
  [TrainingRecipe.PRETRAIN]:'trainer/train_pretrain.py',
  [TrainingRecipe.SFT]:'trainer/train_full_sft.py',
  [TrainingRecipe.LORA]:'trainer/train_lora.py',
  [TrainingRecipe.DPO]:'trainer/train_dpo.py',
  [TrainingRecipe.PPO]:'trainer/train_ppo.py',
  [TrainingRecipe.GRPO]:'trainer/train_grpo.py',
  [TrainingRecipe.DISTILLATION]:'trainer/train_distillation.py',
  [TrainingRecipe.AGENTIC_RL]:'trainer/train_agent.py'
});

export class MiniMindAdapter {
  constructor({ revision = MINIMIND_UPSTREAM.revision } = {}) {
    this.revision = String(revision || MINIMIND_UPSTREAM.revision);
  }

  capabilities() {
    return {
      recipes:Object.keys(ENTRYPOINTS),
      agenticRlAlgorithms:['grpo','cispo'],
      toolUse:true,
      denseAndMoe:true,
      openAiCompatibleServing:true,
      upstream:{ ...MINIMIND_UPSTREAM, revision:this.revision }
    };
  }

  buildExecutorSpec(job, dataset) {
    const entrypoint = ENTRYPOINTS[job?.recipe];
    if (!entrypoint) throw new Error('MiniMind recipe not supported');
    if (!job?.approvalRef) throw new Error('MiniMind executor export requires approved job');
    if (!dataset?.provenanceRefs?.length) throw new Error('MiniMind executor export requires dataset provenance');

    const parameters = structuredClone(job.parameters || {});
    if (job.recipe === TrainingRecipe.AGENTIC_RL) {
      const algorithm = String(parameters.algorithm || 'grpo').toLowerCase();
      if (!['grpo','cispo'].includes(algorithm)) throw new Error('agentic_rl algorithm must be grpo or cispo');
      parameters.algorithm = algorithm;
    }

    return Object.freeze({
      adapter:'minimind',
      execute:false,
      executionPolicy:'external-isolated-runner',
      upstream:Object.freeze({ ...MINIMIND_UPSTREAM, revision:this.revision }),
      entrypoint,
      recipe:job.recipe,
      dataset:Object.freeze({
        id:dataset.id,
        name:dataset.name,
        version:dataset.version,
        sensitivity:dataset.sensitivity,
        provenanceRefs:structuredClone(dataset.provenanceRefs)
      }),
      output:Object.freeze({ modelName:job.modelName }),
      parameters:Object.freeze(parameters),
      approvalRef:job.approvalRef
    });
  }
}
