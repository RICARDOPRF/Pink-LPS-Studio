const assert = require('node:assert');
const fs = require('node:fs');

const bridge = fs.readFileSync('visual/pink-avatar-performance-bridge.mjs', 'utf8');
const health = fs.readFileSync('visual/pink-runtime-health.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(bridge, /PinkPerformance\?\.profile\?\.\(\)/, 'bridge must consume the shared performance profile');
assert.match(bridge, /maxFps/, 'avatar FPS budget missing');
assert.match(bridge, /maxDpr/, 'avatar DPR budget missing');
assert.match(bridge, /accumulatedDt/, 'skipped frame delta must be accumulated');
assert.match(bridge, /document\.hidden/, 'hidden tab guard missing');
assert.match(bridge, /pinkperformance:change/, 'live performance profile listener missing');
assert.match(bridge, /pinkavatar:adapter-ready/, 'adapter boot-order recovery missing');
assert.match(bridge, /performanceGoverned:\s*true/, 'governed adapter flag missing');
assert.match(bridge, /version:\s*'3\.5\.1'/, 'bridge version must be 3.5.1');
assert.match(bridge, /removeEventListener\('pinkperformance:change'/, 'performance listener cleanup missing');

assert.match(health, /window\.PinkRuntimeHealth/, 'runtime health public API missing');
assert.match(health, /criticalReady/, 'critical module health check missing');
assert.match(health, /modelExpected/, 'expected model health check missing');
assert.match(health, /modelMissing/, 'missing model diagnostic missing');
assert.match(health, /webglLost/, 'WebGL health diagnostic missing');
assert.match(health, /PinkAvatarRegistry/, 'registry diagnostic missing');
assert.match(health, /PinkAvatar3D/, 'avatar diagnostic missing');
assert.match(health, /PinkPerformance/, 'performance diagnostic missing');
assert.match(health, /pinkruntime:health/, 'health event missing');
assert.match(health, /visibilitychange/, 'visibility-aware diagnostics missing');

assert.match(health, /PinkFoundation/, 'Foundation health diagnostic missing');
assert.match(health, /PinkMemoryCore/, 'Memory Core diagnostic missing');
assert.match(health, /PinkMemoryCloud/, 'Memory Cloud diagnostic missing');
assert.match(health, /memoryMode/, 'memory mode diagnostic missing');
assert.match(health, /memoryFallback/, 'memory fallback diagnostic missing');
assert.match(health, /memoryHasError/, 'memory error-state diagnostic missing');
assert.match(health, /pinkfoundation:ready/, 'Foundation ready signal missing');
assert.match(health, /pinkfoundation:error/, 'Foundation error signal missing');
assert.match(health, /pinkmemory:ready/, 'memory ready signal missing');

assert.match(html, /pink-avatar-performance-bridge\.mjs\?v=3\.5\.1/, 'avatar performance bridge not wired');
assert.match(html, /pink-runtime-health\.js\?v=3\.5\.2/, 'runtime health diagnostics not wired');
const adapterPosition = html.indexOf('pink-avatar-model-adapter.mjs?v=3.4.0');
const bridgePosition = html.indexOf('pink-avatar-performance-bridge.mjs?v=3.5.1');
const registryPosition = html.indexOf('pink-avatar-registry.js?v=3.3.3');
assert.ok(adapterPosition > -1 && bridgePosition > adapterPosition && registryPosition > bridgePosition, 'bridge must load between adapter and registry');


// Dynamic diagnostics contract: memory/foundation signals are informational and preserve legacy status.
const vm = require('node:vm');
const listeners = new Map();
const stage = { dataset: {} };
const body = { dataset: {} };
const fakeWindow = {
  PinkCore: {}, PinkVoice: { mode: 'listening' }, PinkNVIDIA: {}, PinkAvatar3D: { snapshot: () => ({ mode: 'portrait', model: { mode: 'portrait', hasModel: false } }) },
  PinkAvatarRegistry: { snapshot: () => ({ status: 'fallback', asset: null }) }, PinkPerformance: { snapshot: () => ({ tier: 'balanced' }) },
  Pink3DPresence: { snapshot: () => ({ ready: true, fallback: false }) }, PinkHolographicUI: {}, PinkVoiceReactive: {},
  PinkMemoryCore: {}, PinkPublicConfig: { features: { cloudMemory: true } },
  PinkFoundation: { health: () => ({ ok: true, environment: 'secret-deployment-label', config: { ok: true }, ledgerConsistent: true }) },
  PinkEvolution: {},
  addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
  removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(x => x !== fn)); },
  dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); return true; }
};
const fakeDocument = {
  hidden: false,
  body,
  querySelector(selector) { return selector === '#pinkStage' ? stage : null; },
  addEventListener(name, fn) { fakeWindow.addEventListener(name, fn); },
  removeEventListener(name, fn) { fakeWindow.removeEventListener(name, fn); }
};
const sandbox = {
  window: fakeWindow, document: fakeDocument,
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  setInterval: () => 1, clearInterval: () => {}, setTimeout: fn => { fn(); return 1; }, console
};
vm.runInNewContext(health, sandbox, { filename: 'pink-runtime-health.js' });
let snap = fakeWindow.PinkRuntimeHealth.snapshot();
assert.equal(snap.status, 'ok', 'informational memory/foundation diagnostics must not degrade legacy health');
assert.equal(snap.memory.mode, 'local-fallback', 'Memory Core without cloud API should report local fallback');
assert.equal(snap.memory.fallback, true, 'local fallback flag should be true');
assert.equal(Object.prototype.hasOwnProperty.call(snap.foundation, 'environment'), false, 'foundation environment must not be exposed');
fakeWindow.PinkMemoryCloud = { status: 'booting', health: () => ({ ok: true }) };
fakeWindow.dispatchEvent(new sandbox.CustomEvent('pinkmemory:ready', { detail: { status: 'booting' } }));
snap = fakeWindow.PinkRuntimeHealth.snapshot();
assert.equal(snap.memory.mode, 'booting', 'booting cloud API must not be mislabeled as local fallback');
assert.equal(snap.memory.fallback, false, 'booting cloud API is not local fallback');
assert.equal(snap.status, 'ok', 'memory readiness signal must not change legacy status');

console.log('Pink runtime health + avatar performance bridge contract: OK');
