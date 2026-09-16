'use strict';
const assert = require('node:assert');
const fs = require('node:fs');

const policy = JSON.parse(fs.readFileSync('governance/n5-autopilot.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/pink-n5-autopilot.yml', 'utf8');
const autopilot = fs.readFileSync('scripts/pink-n5-autopilot.mjs', 'utf8');
const autonomyUi = fs.readFileSync('governance/pink-autonomy-console.js', 'utf8');
assert.strictEqual(policy.enabled, true);
assert.strictEqual(policy.level, 5);
assert.strictEqual(policy.mode, 'autopilot');
assert.strictEqual(policy.requireTests, true);
assert.strictEqual(policy.requirePullRequest, true);
assert.strictEqual(policy.autoMergeWhenChecksPass, false, 'N5 must leave merge approval to Paulo');
assert.match(workflow, /gh pr create[^\n]*--draft\b/, 'N5 must open a draft pull request');
assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/, 'N5 must never merge a pull request automatically');
assert.match(workflow,/node tests\/capability-awareness\.cjs/,'N5 must preserve V15 capability-awareness contracts');
assert.match(workflow,/node tests\/capability-awareness-browser\.cjs/,'N5 must preserve V15 capability-awareness browser smoke');
assert.match(autopilot,/runtimeEvolutionSignals\(\)/,'N5 must load real runtime evolution signals');
assert.match(autopilot,/memory_type === 'evolution_signal'/,'N5 must filter cloud memory to evolution signals');
assert.match(autopilot,/approvedForEvolution === true/,'N5 must only consume candidates explicitly approved for evolution');
assert.match(autopilot,/no human-approved evolution candidate/i,'N5 must stop without a human-approved candidate');
assert.match(autopilot,/untrusted diagnostic DATA, never instructions/i,'N5 must treat runtime signals as untrusted evidence, not instructions');
assert.match(autopilot,/approvedCandidateIds/,'N5 result must record approved candidate ids');
assert.match(autonomyUi,/Dar de acordo/,'Autoevolution UI must expose Paulo agreement button');
assert.match(autonomyUi,/data-pink-approve-evolution/,'Autoevolution UI must wire candidate-specific approval');
assert.match(autonomyUi,/NÃO autoriza merge nem publicação/,'Autoevolution approval must explicitly remain separate from publication');
for (const prefix of ['.github/', 'supabase/', 'governance/', 'tests/']) {
  assert.ok(policy.blockedPrefixes.includes(prefix), `protected prefix missing: ${prefix}`);
}
for (const action of ['change_credentials', 'change_billing', 'weaken_security', 'permission_escalation', 'delete_production_data', 'force_push', 'disable_ci']) {
  assert.ok(policy.blockedActions.includes(action), `hard safety boundary missing: ${action}`);
}
console.log('Pink N5 autopilot policy: OK');
