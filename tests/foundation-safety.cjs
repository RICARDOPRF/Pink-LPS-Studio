'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const configSource = fs.readFileSync('pink-public-config.js', 'utf8');
const sandbox = {
  window: {},
  location: { hostname: 'ricardoprf.github.io' },
  Object,
  console
};
vm.createContext(sandbox);
vm.runInContext(configSource, sandbox);
const publicConfig = sandbox.window.PinkPublicConfig;
assert.ok(publicConfig, 'public config must initialize');
assert.strictEqual(publicConfig.environment, 'production');
assert.strictEqual(publicConfig.features.pink3d, true);

const foundationApi = require('../foundation/pink-foundation.js');
const foundation = foundationApi.createFoundation(publicConfig);
assert.strictEqual(foundation.validation.ok, true, foundation.validation.errors.join('; '));
assert.strictEqual(foundation.health().ok, true);

const R = foundation.risk;
assert.strictEqual(foundation.requiresApproval(R.READ_ONLY), false);
assert.strictEqual(foundation.requiresApproval(R.REVERSIBLE), false);
assert.strictEqual(foundation.requiresApproval(R.EXTERNAL_WRITE), true);
assert.strictEqual(foundation.requiresApproval(R.DESTRUCTIVE), true);
assert.strictEqual(foundation.requiresApproval(R.PRODUCTION), true);
assert.throws(() => foundation.normalizeRisk('UNKNOWN'), /Unknown Pink risk class/);

const action = { id: 'write-1', risk: R.EXTERNAL_WRITE };
assert.strictEqual(foundation.approval.canExecute(action).allowed, false);
assert.strictEqual(foundation.approval.canExecute(action, { approved: true, actionId: 'other' }).allowed, false);
assert.strictEqual(foundation.approval.canExecute(action, { approved: true, actionId: 'write-1' }).allowed, true);
assert.strictEqual(foundation.approval.canExecute({ id: 'read-1', risk: R.READ_ONLY }).allowed, true);

let now = 1000;
const ledger = new foundation.RunLedger({ now: () => now, maxEntries: 20 });
const run = ledger.start({ id: 'run-1', phase: 0, task: 'baseline', risk: R.READ_ONLY });
assert.strictEqual(run.status, 'running');
ledger.addEvidence('run-1', { type: 'test', value: 'PASS' });
now = 1500;
const finished = ledger.finish('run-1', 'completed', { evidence: 'ci' });
assert.strictEqual(finished.status, 'completed');
assert.strictEqual(finished.finishedAt, 1500);
assert.strictEqual(ledger.assertConsistent(), true);
assert.throws(() => ledger.finish('run-1', 'failed'), /already terminal/);
assert.throws(() => ledger.start({ id: 'run-1' }), /Duplicate run id/);

ledger.start({ id: 'run-2', task: 'timeout-test' });
now = 5000;
assert.deepStrictEqual(ledger.timeoutStale(1000), ['run-2']);
assert.strictEqual(ledger.get('run-2').status, 'timeout');

const badConfig = JSON.parse(JSON.stringify(publicConfig));
badConfig.supabase.anonKey = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signaturevalue';
assert.strictEqual(foundation.validateConfig(badConfig).ok, false, 'service role key must fail browser config validation');

assert.strictEqual(
  foundation.redactSecrets('token ghp_abcdefghijklmnopqrstuvwxyz1234567890'),
  'token [REDACTED_GITHUB_TOKEN]'
);
assert.match(foundation.redactSecrets('sk-abcdefghijklmnopqrstuvwxyz123456'), /REDACTED_API_KEY/);

console.log('Pink Foundation & Safety contract: OK');
