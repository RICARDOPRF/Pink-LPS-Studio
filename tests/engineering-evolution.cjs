'use strict';
const assert = require('node:assert');

const autonomous = require('../evolution/pink-autonomous-evolution.js');
const gateCandidate = autonomous.observe({id:'cand_human_gate',type:'reliability',title:'Falha de câmera observada',evidence:'camera_runtime_unavailable',impact:.8,confidence:.95,risk:.15,effort:.25});
assert.strictEqual(gateCandidate.approvedForEvolution,false,'new candidates must start without human approval');
assert.ok(!autonomous.prioritize(10).some(c=>c.id===gateCandidate.id),'unapproved candidate must not enter autonomous engineering priority');
const humanApproved = autonomous.approve(gateCandidate.id,{source:'contract-test'});
assert.strictEqual(humanApproved.status,'approved_for_evolution');
assert.strictEqual(humanApproved.approvedForEvolution,true);
assert.strictEqual(humanApproved.approvedBy,'Paulo Ricardo');
assert.ok(autonomous.prioritize(10).some(c=>c.id===gateCandidate.id),'human-approved candidate must become eligible for autonomous engineering');
assert.strictEqual(autonomous.can('publish_production'),false,'candidate agreement must never authorize production publication');

const candidate = {
  id: 'cand_test_001',
  kind: 'reliability',
  title: 'Corrigir fallback de provedor',
  evidence: ['OpenAI indisponível', 'NVIDIA timeout'],
  score: 0.82,
  status: 'candidate'
};

let autonomyLevel = 2;
let studioCalls = [];
let learning = [];
let sessions = [];

global.PinkAutonomousEvolution = {
  snapshot: () => ({ candidates: [candidate] }),
  prioritize: () => [candidate],
  observe: signal => ({ ...candidate, title: signal.title || candidate.title }),
  engine: { recordLearning: entry => learning.push(entry) }
};
global.PinkAutonomy = { getLevel: () => autonomyLevel };
global.PinkFoundation = {
  approval: {
    canExecute(action, approval) {
      const valid = Boolean(approval?.approved === true && approval?.actionId === action.id);
      return { allowed: valid, reason: valid ? 'explicit-approval' : 'approval-required', assessment: { risk: action.risk } };
    }
  }
};
global.PinkStudio = {
  async run(goal, options) {
    studioCalls.push({ goal, options });
    return {
      id: 'studio_test',
      status: 'completed',
      branch: options.branchName,
      tests: [{ name: 'ci', status: 'passed' }],
      review: [{ decision: 'approve' }],
      diff: 'safe diff',
      preview: 'preview://test'
    };
  }
};
global.PinkOperatingCore = { snapshot: () => ({ awareness: { activeProject: { id: 'pink' } } }) };
global.PinkEvolution = { recordSession: value => sessions.push(value) };

const engineering = require('../evolution/pink-engineering-loop.js');

const prepared = engineering.prepare(candidate.id);
assert.strictEqual(prepared.status, 'prepared');
assert.strictEqual(prepared.risk, 'EXTERNAL_WRITE');
assert.strictEqual(prepared.publish, false);
assert.match(prepared.branchName, /^evolution\//);
assert.match(prepared.goal, /Não faça merge em main/);
assert.match(prepared.goal, /não publique produção/i);

(async () => {
  const atN2 = await engineering.runLab(candidate.id, {});
  assert.strictEqual(atN2.status, 'needs_autonomy_level');
  assert.strictEqual(atN2.requiredAutonomy, 3);
  assert.strictEqual(studioCalls.length, 0, 'N2 must never invoke Pink Studio external-write lab');

  autonomyLevel = 3;
  const noApproval = await engineering.runLab(candidate.id, {});
  assert.strictEqual(noApproval.status, 'needs_approval');
  assert.strictEqual(noApproval.risk, 'EXTERNAL_WRITE');
  assert.strictEqual(studioCalls.length, 0, 'N3 still requires explicit approval');

  const approval = { approved: true, actionId: prepared.actionId };
  const approved = await engineering.runLab(candidate.id, { approval });
  assert.strictEqual(approved.status, 'ready_for_review');
  assert.strictEqual(studioCalls.length, 1);
  assert.strictEqual(studioCalls[0].options.publish, false, 'engineering loop must never auto-publish');
  assert.strictEqual(studioCalls[0].options.risk, 'EXTERNAL_WRITE');
  assert.strictEqual(studioCalls[0].options.approved, true);
  assert.match(studioCalls[0].options.branchName, /^evolution\//);
  assert.ok(learning.some(item => item.result === 'ready_for_review'));
  assert.ok(sessions.some(item => String(item).startsWith('engineering-ready:')));

  const snap = engineering.snapshot();
  assert.strictEqual(snap.policy, 'LAB_FIRST_NO_SELF_PUBLISH');
  assert.ok(snap.blockedActions.includes('merge_main'));
  assert.ok(snap.blockedActions.includes('publish_production'));

  console.log('Pink Engineering Evolution contract: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
