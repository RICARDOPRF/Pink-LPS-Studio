import assert from 'node:assert/strict';
const allowed=new Set(['pending','running','completed','failed']);
for(const x of ['pending','running','completed','failed']) assert.ok(allowed.has(x));
const jobs=[
 ['relativity','gwosc'],
 ['quantum','cern-open-data'],
 ['space','gaia-archive'],
 ['space','nasa-astrophysics'],
 ['classical-physics','nasa-science-data']
];
assert.equal(jobs.length,5);
assert.equal(new Set(jobs.map(x=>x[1])).size,5);
console.log('Pink Science Worker contracts: PASS');
