const assert = require('node:assert');
const fs = require('node:fs');

const js = fs.readFileSync('visual/pink-runtime-governor.js', 'utf8');
const css = fs.readFileSync('visual/pink-runtime-governor.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const presence = fs.readFileSync('visual/pink-3d-presence.js', 'utf8');
const adapter = fs.readFileSync('visual/pink-avatar-model-adapter.mjs', 'utf8');

for (const profile of ['economy','balanced','cinematic']) assert.match(js, new RegExp(profile), `missing ${profile} profile`);
assert.match(js, /targetFps:\s*24/, 'economy FPS budget missing');
assert.match(js, /targetFps:\s*30/, 'balanced FPS budget missing');
assert.match(js, /targetFps:\s*60/, 'cinematic FPS budget missing');
assert.match(js, /presenceDpr:\s*1\b/, 'economy presence DPR missing');
assert.match(js, /modelDpr:\s*1\b/, 'economy model DPR missing');
assert.match(js, /presenceDpr:\s*1\.25/, 'balanced presence DPR missing');
assert.match(js, /modelDpr:\s*1\.2/, 'balanced model DPR missing');
assert.match(js, /presenceDpr:\s*1\.7/, 'cinematic presence DPR missing');
assert.match(js, /modelDpr:\s*1\.65/, 'cinematic model DPR missing');
assert.match(js, /presenceParticles:\s*180/, 'economy particle budget missing');
assert.match(js, /presenceParticles:\s*360/, 'balanced particle budget missing');
assert.match(js, /presenceParticles:\s*720/, 'cinematic particle budget missing');
assert.match(js, /presenceConnections:\s*24/, 'economy connection budget missing');
assert.match(js, /presenceConnections:\s*48/, 'balanced connection budget missing');
assert.match(js, /presenceConnections:\s*92/, 'cinematic connection budget missing');
assert.match(js, /powerPreference:\s*'low-power'/, 'low-power GPU preference missing');
assert.match(js, /powerPreference:\s*'high-performance'/, 'cinematic GPU preference missing');
assert.match(js, /antialias:\s*false/, 'mobile antialias budget missing');
assert.match(js, /antialias:\s*true/, 'cinematic antialias budget missing');
assert.match(js, /deviceMemory/, 'device memory capability check missing');
assert.match(js, /hardwareConcurrency/, 'CPU capability check missing');
assert.match(js, /saveData/, 'network save-data check missing');
assert.match(js, /prefers-reduced-motion/, 'reduced-motion capability check missing');
assert.match(js, /PerformanceObserver/, 'long-task observer missing');
assert.match(js, /webglcontextlost/, 'WebGL loss handling missing');
assert.match(js, /webglcontextrestored/, 'WebGL restore handling missing');
assert.match(js, /PinkAvatarRegistry\?\.refresh/, 'avatar recovery refresh missing');
assert.match(js, /pinkperformance:change/, 'shared quality-change event missing');
assert.match(js, /get profile\(\) \{ return qualitySnapshot\(\); \}/, 'profile must expose shared quality object');
assert.match(js, /get quality\(\) \{ return qualitySnapshot\(\); \}/, 'quality getter missing');
assert.match(js, /PinkRuntimeHealth|pinkRuntimeHealth|pink-runtime-health|pinkRuntimeHealth/i, 'runtime health state missing');
assert.match(js, /window\.PinkPerformance/, 'public performance API missing');
assert.match(js, /snapshot/, 'diagnostic snapshot missing');

assert.match(presence, /PinkPerformance\?\.quality/, 'Presence Core must consume shared quality object');
assert.match(presence, /q\.targetFps/, 'Presence Core must respect target FPS');
assert.match(presence, /q\.presenceDpr/, 'Presence Core must respect DPR budget');
assert.match(presence, /q\.presenceMotionScale/, 'Presence Core must respect motion budget');
assert.match(presence, /pinkperformance:change/, 'Presence Core must react to profile changes');

assert.match(adapter, /PinkPerformance\?\.profile/, 'avatar adapter must consume shared governor profile');
assert.match(adapter, /q\.modelDpr/, 'avatar adapter must respect model DPR budget');
assert.match(adapter, /qualityProfile\(\)\.targetFps/, 'avatar adapter must throttle WebGL draw cadence');
assert.match(adapter, /q\.modelMotionScale/, 'avatar adapter must respect model motion budget');
assert.match(adapter, /pinkperformance:change/, 'avatar adapter must react to profile changes');
assert.match(adapter, /document\.hidden/, 'avatar adapter must skip hidden-tab drawing');

assert.match(css, /data-pink-performance="economy"/, 'economy CSS budget missing');
assert.match(css, /data-pink-visibility="paused"/, 'hidden-tab visual pause missing');
assert.match(css, /data-webgl-health="lost"/, 'WebGL recovery UI missing');
assert.match(css, /prefers-reduced-motion/, 'reduced-motion CSS missing');

assert.match(html, /pink-runtime-governor\.css\?v=3\.5\.0/, 'governor CSS not wired');
assert.match(html, /pink-runtime-governor\.js\?v=3\.5\.0/, 'governor runtime not wired');
const governorPosition = html.indexOf('pink-runtime-governor.js?v=3.5.0');
const controllerPosition = html.indexOf('pink-avatar-controller.js?v=3.3.2');
assert.ok(governorPosition > -1 && governorPosition < controllerPosition, 'governor must initialize before avatar runtime');

assert.ok(!fs.existsSync('visual/pink-performance-governor.js'), 'duplicate performance governor must not exist');

console.log('Pink runtime governor contract: OK');
