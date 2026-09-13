const assert = require('node:assert');
const fs = require('node:fs');

const adapter = fs.readFileSync('visual/pink-avatar-model-adapter.mjs', 'utf8');
const registry = fs.readFileSync('visual/pink-avatar-registry.js', 'utf8');
const css = fs.readFileSync('visual/pink-avatar-model-adapter.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(adapter, /GLTFLoader/, 'adapter must use GLTFLoader');
assert.match(adapter, /VRMLoaderPlugin/, 'adapter must support VRM');
assert.match(adapter, /window\.PinkAvatarModelAdapter/, 'adapter global API missing');
assert.match(adapter, /setViseme\(/, 'real model viseme bridge missing');
assert.match(adapter, /setJaw\(/, 'real model jaw bridge missing');
assert.match(adapter, /setLook\(/, 'real model look bridge missing');
assert.match(adapter, /setExpression\(/, 'real model expression bridge missing');
assert.match(adapter, /blink\(/, 'real model blink bridge missing');
assert.match(adapter, /MAX_MODEL_BYTES/, 'model size guard missing');
assert.match(adapter, /MODEL_HOST_SUFFIX/, 'model host allowlist missing');
assert.match(adapter, /renderer\.dispose\(\)/, 'renderer cleanup missing');
assert.match(adapter, /forceContextLoss/, 'GPU context cleanup missing');
assert.match(adapter, /pinkavatar:adapter-ready/, 'adapter ready event missing');

assert.match(registry, /pinkavatar:adapter-ready/, 'registry must retry after adapter boot');
assert.match(css, /pink-avatar-model-ready \.portrait/, 'portrait must hide only after real model ready');
assert.match(css, /pink-avatar-model-ready \.lip-sync/, 'fallback lip overlay must hide for real model');

assert.match(html, /three@0\.180\.0\/build\/three\.module\.js/, 'Three.js version must be pinned');
assert.match(html, /@pixiv\/three-vrm@3\.5\.5/, 'three-vrm version must be pinned');
assert.match(html, /pink-avatar-model-adapter\.mjs\?v=3\.4\.0/, 'adapter module must be wired');
assert.match(html, /pink-avatar-model-adapter\.css\?v=3\.4\.0/, 'adapter styles must be wired');

console.log('Pink avatar model adapter contract: OK');
