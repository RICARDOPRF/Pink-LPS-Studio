const assert = require('node:assert');
const fs = require('node:fs');

const js = fs.readFileSync('visual/pink-runtime-governor.js', 'utf8');
const css = fs.readFileSync('visual/pink-runtime-governor.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

for (const profile of ['economy','balanced','cinematic']) assert.match(js, new RegExp(profile), `missing ${profile} profile`);
assert.match(js, /targetFps:\s*24/, 'economy FPS budget missing');
assert.match(js, /targetFps:\s*30/, 'balanced FPS budget missing');
assert.match(js, /targetFps:\s*60/, 'cinematic FPS budget missing');
assert.match(js, /deviceMemory/, 'device memory capability check missing');
assert.match(js, /hardwareConcurrency/, 'CPU capability check missing');
assert.match(js, /saveData/, 'network save-data check missing');
assert.match(js, /prefers-reduced-motion/, 'reduced-motion capability check missing');
assert.match(js, /PerformanceObserver/, 'long-task observer missing');
assert.match(js, /webglcontextlost/, 'WebGL loss handling missing');
assert.match(js, /webglcontextrestored/, 'WebGL restore handling missing');
assert.match(js, /PinkAvatarRegistry\?\.refresh/, 'avatar recovery refresh missing');
assert.match(js, /PinkRuntimeHealth|pinkRuntimeHealth|pink-runtime-health|pinkRuntimeHealth/i, 'runtime health state missing');
assert.match(js, /window\.PinkPerformance/, 'public performance API missing');
assert.match(js, /snapshot/, 'diagnostic snapshot missing');

assert.match(css, /data-pink-performance="economy"/, 'economy CSS budget missing');
assert.match(css, /data-pink-visibility="paused"/, 'hidden-tab visual pause missing');
assert.match(css, /data-webgl-health="lost"/, 'WebGL recovery UI missing');
assert.match(css, /prefers-reduced-motion/, 'reduced-motion CSS missing');

assert.match(html, /pink-runtime-governor\.css\?v=3\.5\.0/, 'governor CSS not wired');
assert.match(html, /pink-runtime-governor\.js\?v=3\.5\.0/, 'governor runtime not wired');
const governorPosition = html.indexOf('pink-runtime-governor.js?v=3.5.0');
const controllerPosition = html.indexOf('pink-avatar-controller.js?v=3.3.2');
assert.ok(governorPosition > -1 && governorPosition < controllerPosition, 'governor must initialize before avatar runtime');

console.log('Pink runtime governor contract: OK');
