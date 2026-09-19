const assert = require('node:assert');
const fs = require('node:fs');

const js = fs.readFileSync('visual/pink-holographic-ui.js', 'utf8');
const css = fs.readFileSync('visual/pink-holographic-ui.css', 'utf8');
const orb = fs.readFileSync('visual/pink-orb-console.mjs', 'utf8');
const orbCss = fs.readFileSync('visual/pink-orb-console.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const deps = JSON.parse(fs.readFileSync('foundation/dependencies.json', 'utf8'));

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

assert.match(orb, /const VERSION='1\.3\.0'/, 'orbital command center version missing');
assert.match(orb, /window\.PinkCore\?\.projects/, 'orbital projects must come from Pink project registry');
assert.match(orb, /window\.PinkCore\?\.openProject/, 'orbital project activation must use PinkCore');
assert.match(orb, /@mediapipe\/tasks-vision@\$\{MP_VERSION\}/, 'pinned MediaPipe module source missing');
assert.match(orb, /const MP_VERSION='1\.0\.1'/, 'MediaPipe version must be pinned');
assert.match(orb, /hand_landmarker\.task/, 'hand landmark model missing');
assert.match(orb, /window\.PinkVision\?\.start/, 'gesture mode must reuse explicit Pink Vision camera runtime');
assert.match(orb, /cameraStartedByGesture/, 'gesture camera ownership guard missing');
assert.match(orb, /Math\.hypot\(tip\.x-thumb\.x,tip\.y-thumb\.y\)<\.055/, 'pinch activation threshold missing');
assert.match(orb, /closest\?\.\('\.pink-orbit-card'\)/, 'air-click must be limited to project cards');
assert.doesNotMatch(orb, /navigator\.mediaDevices\.getUserMedia/, 'orbital UI must not bypass Pink Vision camera permission flow');
assert.match(orb, /processing:'on-device'/, 'gesture processing mode evidence missing');
assert.match(orb, /avatarRendered:false/, 'orbital snapshot must state that no avatar is rendered');

assert.match(orbCss, /\.pink-stage\.pink-orb-screen>\.portrait[\s\S]*display:none!important/, 'portrait/avatar must remain hidden in orbital mode');
assert.match(orbCss, /\.pink-orbit-card/, 'floating project cards missing');
assert.match(orbCss, /\.pink-gesture-cursor/, 'camera gesture cursor missing');
assert.match(orbCss, /body\.pink-orbital-mode \.workspace\{grid-template-columns:1fr\}/, 'orbital full-width layout missing');
assert.match(orbCss, /prefers-reduced-motion/, 'orbital reduced motion handling missing');

const mediaPipe = deps.runtime.find(item => item.name === '@mediapipe/tasks-vision');
assert.ok(mediaPipe, 'MediaPipe dependency inventory entry missing');
assert.strictEqual(mediaPipe.version, '1.0.1', 'MediaPipe dependency version mismatch');
assert.strictEqual(mediaPipe.license, 'Apache-2.0', 'MediaPipe license record mismatch');

assert.match(html, /pink-holographic-ui\.css\?v=3\.4\.3/, 'HUD styles not wired at current CSS version');
assert.match(html, /pink-holographic-ui\.js\?v=3\.4\.2/, 'HUD runtime not wired');
assert.match(html, /pink-orb-console\.css\?v=1\.3\.0/, 'orbital styles are not wired at v1.3.0');
assert.match(html, /pink-orb-console\.mjs\?v=1\.3\.0/, 'orbital runtime is not wired at v1.3.0');

console.log('Pink holographic + orbital UI contract: OK');
