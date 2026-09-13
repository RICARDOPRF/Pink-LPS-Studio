const assert = require('node:assert');
const fs = require('node:fs');

const js = fs.readFileSync('visual/pink-holographic-ui.js', 'utf8');
const css = fs.readFileSync('visual/pink-holographic-ui.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(js, /pink-only/, 'PINK ONLY mode missing');
assert.match(js, /pink-screen/, 'PINK + SCREEN mode missing');
assert.match(js, /presentation/, 'presentation mode missing');
assert.match(js, /window\.PinkPanels\?\.active/, 'HUD must use real active panel context');
assert.match(js, /window\.PinkStore\?\.store/, 'HUD must use real store context');
assert.match(js, /window\.PinkCore\?\.projects/, 'HUD must use real project registry');
assert.match(js, /iframe\[data-pink-panel\]/, 'panel iframe detection missing');
assert.match(js, /iframe\[data-pink-store\]/, 'store iframe detection missing');
assert.match(js, /iframe\[data-pink-project\]/, 'project iframe detection missing');
assert.match(js, /fullscreenchange/, 'presentation/fullscreen sync missing');
assert.match(js, /pinkavatar:model-ready/, 'avatar HUD refresh missing');
assert.match(js, /textContent/, 'HUD values should render as text, not untrusted HTML');
assert.doesNotMatch(js, /produtividade|previsto|realizado|faturamento|lucro/i, 'HUD must not invent or duplicate operational metrics');

assert.match(css, /data-pink-mode="pink-only"/, 'PINK ONLY layout missing');
assert.match(css, /studio-panel\{display:none!important\}/, 'PINK ONLY must hide studio screen');
assert.match(css, /pink-hud-card/, 'HUD visual cards missing');
assert.match(css, /prefers-reduced-motion/, 'reduced motion handling missing');

assert.match(html, /pink-holographic-ui\.css\?v=3\.4\.2/, 'HUD styles not wired');
assert.match(html, /pink-holographic-ui\.js\?v=3\.4\.2/, 'HUD runtime not wired');

console.log('Pink holographic UI contract: OK');
