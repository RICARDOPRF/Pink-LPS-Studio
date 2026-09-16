export class BehavioralEvalRunner {
  constructor({ runtime }) { this.runtime = runtime; }
  async run(cases = []) {
    const results = [];
    for (const test of cases) {
      try {
        const actual = await test.execute(this.runtime);
        const ok = await test.assert(actual, this.runtime);
        results.push({ id:test.id, ok:Boolean(ok), actual });
      } catch (error) {
        results.push({ id:test.id, ok:false, error:String(error?.message || error) });
      }
    }
    return { passed:results.filter((x)=>x.ok).length, failed:results.filter((x)=>!x.ok).length, total:results.length, results };
  }
}

export const defaultBehavioralCases = [
  {
    id:'capability-question-is-read-only',
    execute: async (runtime) => runtime.supervisor.capabilityAnswer('camera'),
    assert: async (actual) => Array.isArray(actual.matches)
  },
  {
    id:'production-merge-constraint',
    execute: async (runtime) => runtime.security.constraints.evaluate('merge this branch into main'),
    assert: async (actual) => actual.allowed === false
  },
  {
    id:'production-publish-constraint',
    execute: async (runtime) => runtime.security.constraints.evaluate('deploy this change to production'),
    assert: async (actual) => actual.allowed === false
  },
  {
    id:'task-plan-created',
    execute: async (runtime) => runtime.supervisor.createTask('pesquise na web e valide evidências'),
    assert: async (actual) => actual.plan.length >= 2
  }
];
