import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../apps/next/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../apps/next/main.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../apps/next/spatial.css',import.meta.url),'utf8');
assert.match(html,/id="spatial-toggle"/);assert.match(html,/id="spatial-stage"/);assert.match(html,/spatial\.css/);
assert.match(js,/runtime\.spatial\.selectTarget/);assert.match(js,/runtime\.spatial\.setPointer/);assert.match(js,/pinknext:spatial-select/);
assert.match(css,/prefers-reduced-motion/);assert.match(css,/\.spatial-node/);
console.log('Pink V22 Spatial Mission Control contracts: PASS');
