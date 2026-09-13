const assert = require('node:assert');
const fs = require('node:fs');

const perf = fs.readFileSync('visual/pink-performance.js', 'utf8');
const css = fs.readFileSync('visual/pink-performance.css', 'utf8');
const presence = fs.readFileSync('visual/pink-3d-presence.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(perf, /eco:[\s\S]*maxFps:24[\s\S]*maxDpr:1\.0/, 'eco profile missing');
assert.match(perf, /balanced:[\s\S]*maxFps:30[\s\S]*maxDpr:1\.25/, 'balanced profile missing');
assert.match(perf, /high:[\s\S]*maxFps:60[\s\S]*maxDpr:1\.7/, 'high profile missing');
assert.match(perf, /saveData/, 'save-data signal missing');
assert.match(perf, /effectiveType/, 'network quality signal missing');
assert.match(perf, /deviceMemory/, 'device memory signal missing');
assert.match(perf, /hardwareConcurrency/, 'CPU signal missing');
assert.match(perf, /prefers-reduced-motion/, 'reduced motion signal missing');
assert.match(perf, /pinkperformance:change/, 'performance change event missing');
assert.match(perf, /setOverride/, 'diagnostic override API missing');

assert.match(presence, /three@0\.180\.0/, 'presence and avatar Three.js versions must align');
assert.match(presence, /PinkPerformance\?\.profile/, 'presence must consume performance governor');
assert.match(presence, /runtime\.performance\.maxFps/, 'presence FPS cap missing');
assert.match(presence, /runtime\.performance\.maxDpr/, 'presence DPR cap missing');
assert.match(presence, /pinkperformance:change/, 'presence live performance update missing');

assert.match(css, /data-pink-performance="eco"/, 'eco CSS profile missing');
assert.match(css, /prefers-reduced-motion/, 'reduced-motion CSS fallback missing');
assert.match(html, /pink-performance\.js\?v=3\.5\.0/, 'performance runtime not wired');
assert.match(html, /pink-performance\.css\?v=3\.5\.0/, 'performance styles not wired');
assert.match(html, /pink-3d-presence\.js\?v=3\.5\.0/, 'updated presence runtime not wired');

console.log('Pink performance governor contract: OK');
