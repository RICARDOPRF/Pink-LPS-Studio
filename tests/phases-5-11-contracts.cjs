'use strict';
const assert = require('node:assert/strict');

const multi = require('../agents/pink-model-router.js');
const studio = require('../studio/pink-studio.js');
const tools = require('../tools/pink-tool-registry.js');
const companion = require('../companion/pink-companion.js');
const evolution = require('../evolution/pink-autonomous-evolution.js');
const observability = require('../observability/pink-observability.js');
const enterprise = require('../enterprise/pink-enterprise.js');

(async () => {
  // Phase 5 — router must expose evidence-first policy and never invent unavailable providers.
  const multiSnap = multi.snapshot();
  assert.equal(multiSnap.policy, 'NO_EVIDENCE_NO_CLAIM');
  assert.ok(Array.isArray(multiSnap.providers) && multiSnap.providers.length > 0);
  const unavailable = await multi.invoke({ capability: 'coding', prompt: 'contract test only' });
  assert.ok(['blocked_external', 'failed', 'completed'].includes(unavailable.status));
  if (unavailable.status === 'completed') assert.ok(unavailable.provider, 'completed provider calls require provider evidence');

  // Phase 6 — sensitive Studio work must stop at approval before external writes.
  studio.registerAdapter('project', { resolve: async () => ({ id: 'contract-project', repo: 'owner/repo' }) });
  studio.registerAdapter('repo', { resolve: async project => project.repo });
  const studioRun = await studio.run('contract-only production check', { risk: 'PRODUCTION', publish: true, approved: false });
  assert.equal(studioRun.status, 'needs_approval');
  assert.ok(studioRun.risks.includes('PRODUCTION'));

  // Phase 7 — declared write tools must not run without approval.
  const githubWrite = await tools.invoke('github', 'branch.create', { name: 'never-created' }, { approved: false });
  assert.equal(githubWrite.status, 'needs_approval');
  assert.equal(githubWrite.risk, 'EXTERNAL_WRITE');
  assert.equal(tools.snapshot().tools.find(t => t.name === 'painel-router').risk, 'READ_ONLY');

  // Phase 8 — Companion has no generic shell and write/clipboard capabilities stay approval-gated.
  assert.equal(Object.prototype.hasOwnProperty.call(companion.CAPABILITIES, 'shell.execute'), false);
  assert.equal(companion.CAPABILITIES['file.write'].approval, true);
  assert.equal(companion.CAPABILITIES['clipboard.read'].approval, true);
  const shellAttempt = await companion.invoke('shell.execute', {}, {});
  assert.equal(shellAttempt.reason, 'capability_unknown');

  // Phase 9 — autonomous evolution cannot self-publish or weaken security.
  const evoSnap = evolution.snapshot();
  assert.equal(evoSnap.policy, 'LAB_FIRST_NO_SELF_PUBLISH');
  for (const action of ['merge_main', 'publish_production', 'change_billing', 'change_credentials', 'weaken_security']) {
    assert.equal(evolution.can(action), false, `${action} must remain blocked`);
  }

  // Phase 10 — observability redacts secret-like values and exposes health state without external writes.
  observability.log('info', 'contract', { token: 'sk-abcdefghijklmnop', safe: 'ok' });
  const dash = observability.dashboard();
  assert.equal(dash.version, '10.0.0');
  const lastLog = dash.recentLogs.at(-1);
  assert.ok(lastLog, 'expected a contract log entry');
  assert.equal(lastLog.data?.token, '[REDACTED_SECRET]');

  // Phase 11 — deletion remains approval-only and viewer cannot obtain write permission.
  enterprise.setContext({ tenantId: 'tenant-contract', workspaceId: 'workspace-contract', userId: 'user-contract', role: 'viewer' });
  const denied = enterprise.authorize(null, 'tool.write', { tenantId: 'tenant-contract', workspaceId: 'workspace-contract' });
  assert.equal(denied.ok, false);
  const deletion = enterprise.requestDeletion({ tenantId: 'tenant-contract', workspaceId: 'workspace-contract' });
  assert.equal(deletion.status, 'needs_approval');
  assert.equal(deletion.irreversible, true);

  console.log('PASS: Phase 5–11 safety/runtime contracts');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
