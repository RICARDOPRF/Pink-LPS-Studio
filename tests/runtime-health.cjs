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

assert.match(html, /pink-avatar-performance-bridge\.mjs\?v=3\.5\.1/, 'avatar performance bridge not wired');
assert.match(html, /pink-runtime-health\.js\?v=3\.5\.1/, 'runtime health diagnostics not wired');
const adapterPosition = html.indexOf('pink-avatar-model-adapter.mjs?v=3.4.0');
const bridgePosition = html.indexOf('pink-avatar-performance-bridge.mjs?v=3.5.1');
const registryPosition = html.indexOf('pink-avatar-registry.js?v=3.3.3');
assert.ok(adapterPosition > -1 && bridgePosition > adapterPosition && registryPosition > bridgePosition, 'bridge must load between adapter and registry');

console.log('Pink runtime health + avatar performance bridge contract: OK');
