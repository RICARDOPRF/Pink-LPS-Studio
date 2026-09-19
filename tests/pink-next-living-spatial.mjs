import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../apps/next/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../apps/next/main.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../apps/next/spatial.css',import.meta.url),'utf8');
assert.match(html,/id="spatial-links"/);assert.match(html,/id="spatial-task-count"/);assert.match(html,/id="spatial-quality"/);
assert.match(js,/function spatialLoop/);assert.match(js,/updateSpatialHud/);assert.match(js,/cycleSpatialQuality/);assert.match(js,/execute:false|selectTarget/);
assert.match(css,/\.spatial-link/);assert.match(css,/spatialCorePulse/);assert.match(css,/prefers-reduced-motion/);
console.log('Pink V23 Living Spatial Interface contracts: PASS');
