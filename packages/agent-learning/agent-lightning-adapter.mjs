export const AGENT_LIGHTNING_UPSTREAM = Object.freeze({
  repository:'microsoft/agent-lightning',
  version:'v1.0.1',
  revision:'8435586d147b4cf7bff33e687d7317149e79cbb8',
  license:'MIT',
  architecture:Object.freeze(['trainer','api-gateway','rollout-controller']),
  integrationMode:'external-isolated-agent-learning-runner'
});

function text(value, max = 1200) {
  const out = String(value ?? '').trim();
  return out.length > max ? `${out.slice(0, max)}…[truncated]` : out;
}

export class AgentLightningAdapter {
  constructor({ revision = AGENT_LIGHTNING_UPSTREAM.revision } = {}) {
    this.revision = String(revision || AGENT_LIGHTNING_UPSTREAM.revision);
  }

  capabilities() {
    return Object.freeze({
      harnessedAgentRL:true,
      openAICompatibleGateway:true,
      localRolloutRunner:true,
      kubernetesRolloutRunner:true,
      trajectoryAggregation:true,
      transitionAggregation:true,
      optimizationTargets:Object.freeze(['prompt','tools','workflow','model','reasoning']),
      execute:false,
      upstream:Object.freeze({ ...AGENT_LIGHTNING_UPSTREAM, revision:this.revision })
    });
  }

  buildExecutorSpec(plan, { harness, benchmark, trajectories = [] } = {}) {
    if (!plan?.id || !harness?.id || !benchmark?.id) throw new TypeError('Agent Lightning spec requires plan, harness and benchmark');
    if (plan.harnessId !== harness.id || plan.benchmarkId !== benchmark.id) throw new Error('Agent Lightning plan context mismatch');
    if (plan.projectId && harness.projectId && plan.projectId !== harness.projectId) throw new Error('cross-project Agent Lightning export blocked');

    return Object.freeze({
      adapter:'agent-lightning',
      execute:false,
      executionPolicy:'external-isolated-agent-learning-runner',
      upstream:Object.freeze({ ...AGENT_LIGHTNING_UPSTREAM, revision:this.revision }),
      components:Object.freeze([
        Object.freeze({ id:'trainer', role:'build training samples, aggregate traces and update a policy', execution:'external-only' }),
        Object.freeze({ id:'api-gateway', role:'proxy model requests and capture rollout events', execution:'external-only' }),
        Object.freeze({ id:'rollout-controller', role:'launch and reconcile agent rollouts', execution:'external-only' })
      ]),
      plan:Object.freeze({
        id:plan.id,
        projectId:plan.projectId || null,
        objective:text(plan.objective, 1800),
        aggregationLevel:plan.aggregationLevel,
        optimizationTargets:Object.freeze([...(plan.optimizationTargets || [])]),
        approvalRef:text(plan.approvalRef, 320)
      }),
      harness:Object.freeze({
        id:harness.id,
        name:text(harness.name, 180),
        version:text(harness.version, 80),
        entrypointRef:text(harness.entrypointRef || '', 600) || null,
        capabilities:Object.freeze([...(harness.capabilities || [])])
      }),
      benchmark:Object.freeze({
        id:benchmark.id,
        name:text(benchmark.name, 180),
        version:text(benchmark.version, 80),
        datasetRef:text(benchmark.datasetRef, 600),
        metrics:Object.freeze([...(benchmark.metrics || [])]),
        baseline:Object.freeze({ ...(benchmark.baseline || {}) })
      }),
      trajectories:Object.freeze(trajectories.slice(0, 256).map((trajectory) => Object.freeze({
        id:trajectory.id,
        traceRef:text(trajectory.traceRef, 600),
        outcome:trajectory.outcome,
        score:trajectory.score,
        rewardSignals:Object.freeze({ ...(trajectory.rewardSignals || {}) }),
        evidenceRefs:Object.freeze([...(trajectory.evidenceRefs || [])])
      }))),
      runner:Object.freeze({
        preferred:'isolated',
        localAllowed:false,
        kubernetesAllowed:false,
        productionHarnessMutationAllowed:false
      }),
      network:Object.freeze({
        gatewayConfigured:false,
        bearerCredentialConfigured:false,
        modelEndpointConfigured:false
      })
    });
  }
}
