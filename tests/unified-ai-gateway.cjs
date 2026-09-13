'use strict';
const assert=require('assert');
const api=require('../agents/pink-unified-ai-gateway');
(async()=>{
 const g=api.gateway;
 const rag=await g.invoke({prompt:'procure este procedimento no RAG'});assert.equal(rag.status,'blocked_external');assert.equal(rag.capability,'rag');
 const coding=await g.invoke({prompt:'implemente este bug no código'});assert.equal(coding.status,'blocked_external');assert.equal(coding.capability,'coding');
 let calls=0;g.attach('aiq-research',{invoke:async t=>{calls++;return {report:`ok:${t.prompt}`}}});const r=await g.invoke({prompt:'pesquise mercado e concorrentes'});assert.equal(r.status,'completed');assert.equal(r.provider,'aiq-research');assert.equal(calls,1);
 g.attach('nvidia-nemotron',{invoke:async()=>{throw new Error('provider_down')}});const failed=await g.invoke({prompt:'raciocine sobre este problema'});assert.equal(failed.status,'blocked_external');assert.equal(failed.attempts[0].status,'failed');
 const snap=g.snapshot();assert.ok(snap.providers.some(p=>p.id==='gemini-live'));assert.ok(snap.providers.some(p=>p.id==='deepstream'&&p.status==='blocked_external'));
 console.log('unified AI gateway contracts: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
