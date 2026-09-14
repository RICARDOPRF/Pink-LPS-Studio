'use strict';
const assert = require('node:assert');
const fs = require('node:fs');

const policy = JSON.parse(fs.readFileSync('governance/n5-autopilot.json', 'utf8'));
assert.strictEqual(policy.enabled, true);
assert.strictEqual(policy.level, 5);
assert.strictEqual(policy.mode, 'autopilot');
assert.strictEqual(policy.requireTests, true);
assert.strictEqual(policy.requirePullRequest, true);
assert.strictEqual(policy.autoMergeWhenChecksPass, true);
for (const prefix of ['.github/', 'supabase/', 'governance/', 'tests/']) {
  assert.ok(policy.blockedPrefixes.includes(prefix), `protected prefix missing: ${prefix}`);
}
for (const action of ['change_credentials', 'change_billing', 'weaken_security', 'permission_escalation', 'delete_production_data', 'force_push', 'disable_ci']) {
  assert.ok(policy.blockedActions.includes(action), `hard safety boundary missing: ${action}`);
}
console.log('Pink N5 autopilot policy: OK');
