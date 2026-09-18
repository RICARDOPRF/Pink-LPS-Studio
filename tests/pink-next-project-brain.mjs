import assert from 'node:assert/strict';
import { ProjectBrainRegistry, ProjectEntityType, FactStatus } from '../packages/project-brain/index.mjs';
import { GraphitiProjectBrainAdapter, GRAPHITI_UPSTREAM } from '../packages/project-brain/graphiti-adapter.mjs';

const registry = new ProjectBrainRegistry();
registry.registerAdapter('graphiti', new GraphitiProjectBrainAdapter());

const project = registry.registerProject({ id:'beccs-demo', name:'BECCS Demo', client:'LPS Test', code:'BECCS' });
const brain = registry.brain(project.id);

const activity = brain.addEntity({ id:'activity-compression', type:ProjectEntityType.ACTIVITY, name:'CO2 Compression' });
const material = brain.addEntity({ id:'material-blower', type:ProjectEntityType.MATERIAL, name:'Blower package' });

const episode1 = brain.addEpisode({
  id:'episode-rdo-001', kind:'rdo', summary:'Blower package is pending delivery.', observedAt:'2026-09-01T12:00:00Z',
  evidenceRefs:[{ id:'rdo-001', source:'RDO 001', type:'document', summary:'Material status recorded in RDO' }]
});
const fact1 = brain.addFact({ subjectId:material.id, predicate:'delivery_status', object:'pending', episodeId:episode1.id });
assert.equal(fact1.status, FactStatus.CURRENT);
assert.equal(brain.currentFacts({ subjectId:material.id, predicate:'delivery_status' })[0].object, 'pending');

const episode2 = brain.addEpisode({
  id:'episode-rdo-002', kind:'rdo', summary:'Blower package arrived on site.', observedAt:'2026-09-10T12:00:00Z',
  evidenceRefs:[{ id:'rdo-002', source:'RDO 002', type:'document', summary:'Delivery confirmation recorded in RDO' }]
});
const fact2 = brain.addFact({ subjectId:material.id, predicate:'delivery_status', object:'delivered', episodeId:episode2.id });
assert.equal(fact2.status, FactStatus.CURRENT);
assert.equal(brain.currentFacts({ subjectId:material.id, predicate:'delivery_status' })[0].object, 'delivered');
assert.equal(brain.factsAt('2026-09-05T12:00:00Z', { subjectId:material.id, predicate:'delivery_status' })[0].object, 'pending');
assert.equal(brain.factsAt('2026-09-12T12:00:00Z', { subjectId:material.id, predicate:'delivery_status' })[0].object, 'delivered');
assert.equal(brain.evidenceForFact(fact2.id).episode.id, episode2.id);

const relationEpisode = brain.addEpisode({
  kind:'planning', summary:'Compression activity depends on blower package.', observedAt:'2026-09-02T10:00:00Z',
  evidenceRefs:[{ id:'plan-001', source:'Planning review', type:'planning', summary:'Dependency confirmed' }]
});
const relation = brain.addFact({ subjectId:activity.id, predicate:'depends_on', object:'Blower package', objectEntityId:material.id, episodeId:relationEpisode.id, supersedeCurrent:false });
assert.equal(relation.objectEntityId, material.id);

const ingest = registry.exportEpisode(project.id, episode2.id, 'graphiti');
assert.equal(ingest.execute, false);
assert.equal(ingest.tool, 'add_episode');
assert.equal(ingest.arguments.group_id, 'lps-beccs-demo');
assert.equal(ingest.upstream.revision, GRAPHITI_UPSTREAM.revision);
assert.equal(ingest.upstream.license, 'Apache-2.0');

const search = registry.exportFactSearch(project.id, 'What was the blower delivery status?', { validAt:'2026-09-05T12:00:00Z', edgeTypes:['delivery_status'] });
assert.equal(search.execute, false);
assert.equal(search.tool, 'search_memory_facts');
assert.deepEqual(search.arguments.group_ids, ['lps-beccs-demo']);
assert.equal(search.arguments.valid_at, '2026-09-05T12:00:00.000Z');

const other = registry.registerProject({ id:'other-project', name:'Other Project' });
const otherBrain = registry.brain(other.id);
assert.equal(otherBrain.currentFacts().length, 0);
assert.throws(() => otherBrain.addFact({ subjectId:material.id, predicate:'status', object:'x', episodeId:episode2.id }), /subject entity not found/);

assert.throws(() => brain.addEpisode({ summary:'No evidence supplied' }), /evidenceRefs/);
assert.throws(() => brain.addEntity({ name:'Unsafe metadata', metadata:{ apiKey:'must-not-be-stored' } }), /secret-like|rejected/);

console.log('Pink V17 Project Brain + Graphiti adapter contracts: PASS');
