#!/usr/bin/env node
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');

const inventory = JSON.parse(fs.readFileSync('foundation/dependencies.json', 'utf8'));
const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const presence = fs.readFileSync('visual/pink-3d-presence.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/pink-ci.yml', 'utf8');

assert.strictEqual(inventory.schemaVersion, 2, 'dependency inventory schema mismatch');
for (const group of ['runtime','ci']) {
  for (const dep of inventory[group]) {
    assert.ok(dep.name && dep.version && dep.source && dep.license, `incomplete ${group} dependency record: ${JSON.stringify(dep)}`);
    assert.notStrictEqual(String(dep.license).toLowerCase(), 'unknown', `${dep.name} has unknown license`);
  }
}

assert.match(index, /three@0\.180\.0\/build\/three\.module\.js/, 'index must pin three@0.180.0');
assert.match(index, /@pixiv\/three-vrm@3\.5\.5/, 'index must pin @pixiv/three-vrm@3.5.5');
assert.match(presence, /three@0\.180\.0\/build\/three\.module\.js/, 'presence must use pinned Three.js r180');
assert.doesNotMatch(index, /@latest\b|\/latest\//i, 'runtime CDN dependency must not use latest');
assert.doesNotMatch(app, /@latest\b|\/latest\//i, 'runtime dependency must not use latest');

const runtimeNames = new Set(inventory.runtime.map(item => item.name));
for (const required of ['three','@pixiv/three-vrm','Google Fonts / Inter']) {
  assert.ok(runtimeNames.has(required), `missing dependency inventory entry: ${required}`);
}
assert.ok(!runtimeNames.has('@elevenlabs/client'), 'ElevenLabs must not be present in Gemini-only dependency inventory');
const ci = new Map(inventory.ci.map(item => [item.name, item]));
assert.strictEqual(ci.get('playwright')?.version, '1.63.0', 'Playwright CI version must be pinned to 1.63.0');
assert.strictEqual(ci.get('playwright')?.license, 'Apache-2.0', 'Playwright license record mismatch');
if (/playwright@/.test(workflow)) assert.match(workflow, /playwright@1\.63\.0/, 'workflow Playwright install must be pinned');

console.log('Dependency/license audit: OK — Gemini-only runtime inventory validated.');
