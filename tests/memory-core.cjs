'use strict';
const assert=require('node:assert');
const memory=require('../memory/pink-memory-core.js');

class Storage{constructor(){this.map=new Map()}getItem(k){return this.map.has(k)?this.map.get(k):null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}

(async()=>{
  assert.strictEqual(memory.version,'4.1.0');
  assert.strictEqual(memory.normalize('Forno Panela'),'forno panela');
  assert.match(memory.redactSecrets('Authorization: Bearer abc.def.ghi'),/REDACTED/);
  assert.match(memory.redactSecrets('password=supersecreto'),/REDACTED/);
  const curator=new memory.MemoryCurator();
  assert.strictEqual(curator.evaluate({type:'greeting',text:'oi'}).persist,false);
  assert.strictEqual(curator.evaluate({type:'relationship',text:'Nathalia é namorada do Paulo'}).persist,true);
  assert.strictEqual(curator.evaluate({type:'user_instruction',text:'lembre que token=abcd1234',explicit:true}).redacted,true);

  const storage=new Storage();
  const local=new memory.LocalMemoryAdapter({storage});
  const service=new memory.MemoryService({fallback:local});
  const first=await service.remember({type:'project_fact',text:'Forno Panela usa curva S semanal',importance:.8});
  assert.strictEqual(first.status,'stored');
  await service.remember({type:'project_fact',text:'Forno Panela usa curva S semanal',importance:.9});
  assert.strictEqual((await local.listMemories()).length,1,'dedupe must keep one fingerprint');
  await service.remember({type:'preference',text:'Paulo prefere interfaces clean',importance:.85});
  const recall=await service.recall('interface clean Paulo',{limit:3,minScore:.1});
  assert.ok(recall.length>=1);assert.match(recall[0].content_text,/clean/i);

  await service.rememberPerson({name:'Nathalia',relationship:'namorada',source:'self-reported'});
  const person=await service.findPerson('Nathália');
  assert.ok(person);assert.strictEqual(person.relationship,'namorada');
  const list=await service.listPeople();assert.strictEqual(list.length,1);

  const project=await service.rememberProject({id:'beccs',name:'FS BECCS'});
  await service.rememberAlias({project_id:project.id||'beccs',alias:'projeto beccs'});
  assert.ok(await service.resolveAlias('Projeto BECCS'));

  // Primary failure must degrade to local fallback without losing the write.
  const failing={async upsertMemory(){throw new Error('cloud down')},async listMemories(){throw new Error('cloud down')},health(){return{ok:false}}};
  const degraded=new memory.MemoryService({primary:failing,fallback:local});
  const saved=await degraded.remember({type:'decision',text:'Usar Supabase como memória cloud',importance:.9});
  assert.strictEqual(saved.status,'stored');assert.strictEqual(degraded.health().mode,'local-fallback');

  storage.setItem('pink_people_memory_v1',JSON.stringify({nathalia:{name:'Nathalia',relationship:'namorada',firstSeenAt:'2026-01-01T00:00:00Z',lastSeenAt:'2026-01-02T00:00:00Z',source:'self-reported'}}));
  const legacy=memory.migrateLegacyPeople(storage);assert.strictEqual(legacy.length,1);assert.strictEqual(legacy[0].relationship,'namorada');

  const scoreRelated=memory.relevanceScore('BECCS curva', {content_text:'Curva semanal do BECCS',importance:.8,updated_at:new Date().toISOString()});
  const scoreOther=memory.relevanceScore('BECCS curva', {content_text:'preferência de voz',importance:.3,updated_at:'2020-01-01T00:00:00Z'});
  assert.ok(scoreRelated>scoreOther);
  console.log('Pink Memory & People Graph core contract: OK');
})().catch(error=>{console.error(error);process.exit(1)});
