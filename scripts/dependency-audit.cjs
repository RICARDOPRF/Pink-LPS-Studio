#!/usr/bin/env node
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');

const inventory = JSON.parse(fs.readFileSync('foundation/dependencies.json', 'utf8'));
const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const presence = fs.readFileSync('visual/pink-3d-presence.js', 'utf8');

assert.strictEqual(inventory.schemaVersion, 1, 'dependency inventory schema mismatch');
for (const dep of inventory.runtime) {
  assert.ok(dep.name && dep.version && dep.source && dep.license, `incomplete runtime dependency record: ${JSON.stringify(dep)}`);
  assert.notStrictEqual(String(dep.license).toLowerCase(), 'unknown', `${dep.name} has unknown license`);
}

assert.match(index, /three@0\.180\.0\/build\/three\.module\.js/, 'index must pin three@0.180.0');
assert.match(index, /@pixiv\/three-vrm@3\.5\.5/, 'index must pin @pixiv/three-vrm@3.5.5');
assert.match(presence, /three@0\.180\.0\/build\/three\.module\.js/, 'presence must use pinned Three.js r180');
assert.match(app, /@elevenlabs\/client@1\.25\.0\/\+esm/, 'ElevenLabs browser client must be pinned');
assert.doesNotMatch(index, /@latest\b|\/latest\//i, 'runtime CDN dependency must not use latest');
assert.doesNotMatch(app, /@latest\b|\/latest\//i, 'voice CDN dependency must not use latest');

const names = new Set(inventory.runtime.map(item => item.name));
for (const required of ['three','@pixiv/three-vrm','@elevenlabs/client','Google Fonts / Inter']) {
  assert.ok(names.has(required), `missing dependency inventory entry: ${required}`);
}

console.log('Dependency/license audit: OK');
