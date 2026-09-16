'use strict';
const assert=require('node:assert');
const fs=require('node:fs');

(async()=>{
  const camera=require('../vision/pink-camera-router.js');
  globalThis.PinkCameraRouter=camera;
  const intent=require('../core/pink-intent-context-router.js');

  let plan=intent.plan('Pink, abre a câmera');
  assert.strictEqual(plan.intent,'camera');
  assert.strictEqual(plan.steps[0].tool,'camera');
  assert.strictEqual(plan.steps[0].capability,'camera.open');

  plan=intent.plan('Pink, fecha a câmera');
  assert.strictEqual(plan.intent,'camera');
  assert.strictEqual(plan.steps[0].capability,'camera.close');

  plan=intent.plan('Pink, o que você está vendo pela câmera?');
  assert.strictEqual(plan.intent,'camera');
  assert.strictEqual(plan.steps[0].capability,'camera.observe');

  plan=intent.plan('Pink, que horas são agora?');
  assert.strictEqual(plan.intent,'runtime_time');
  assert.strictEqual(plan.steps[0].tool,'runtime-clock');
  assert.strictEqual(plan.steps[0].capability,'time.current');

  plan=intent.plan('Qual a data de hoje?');
  assert.strictEqual(plan.intent,'runtime_time');
  assert.strictEqual(plan.steps[0].capability,'date.current');

  plan=intent.plan('Pesquise na internet as notícias mais recentes sobre NVIDIA');
  assert.strictEqual(plan.intent,'research');
  assert.strictEqual(plan.steps[0].kind,'ai');
  assert.strictEqual(plan.steps[0].capability,'research');

  let starts=0,stops=0;
  globalThis.PinkVision={start:async()=>{starts++;return true},stop:()=>{stops++},ask:async()=>({reply:'Vejo uma mesa.'}),active:true};
  const opened=await camera.open();assert.strictEqual(opened.active,true);assert.strictEqual(starts,1);
  const observed=await camera.observe('O que está vendo?');assert.strictEqual(observed.observation,'Vejo uma mesa.');
  const closed=camera.close();assert.strictEqual(closed.active,false);assert.strictEqual(stops,1);

  globalThis.PinkPublicConfig={supabase:{url:'https://example.supabase.co',anonKey:'public-anon',functions:{geminiReasoning:'pink-gemini-reasoning'}}};
  let posted=null;
  globalThis.fetch=async(_url,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,reply:'Resultado grounded.',grounded:true,provider:'gemini-google-search',model:'gemini-3.6-flash',sources:[{title:'Fonte',url:'https://example.com'}],queries:['teste']})}};
  const research=require('../agents/pink-gemini-research.js');
  const result=await research.search('teste');
  assert.strictEqual(posted.search,true);
  assert.strictEqual(result.reply,'Resultado grounded.');
  assert.strictEqual(result.sources[0].url,'https://example.com');

  const backend=fs.readFileSync('supabase/functions/pink-gemini-reasoning/index.ts','utf8');
  assert.match(backend,/google_search/);
  assert.match(backend,/SEARCH_MODEL = "gemini-3\.6-flash"/);
  assert.match(backend,/sources:/);

  const supervisor=fs.readFileSync('runtime/pink-supervisor-voice.js','utf8');
  assert.match(supervisor,/function runtimeNow\(/);
  assert.match(supervisor,/plan\.intent==='research'/);
  assert.match(supervisor,/plan\.intent==='runtime_time'/);
  assert.match(supervisor,/plan\.intent==='camera'/);

  const evolution=fs.readFileSync('evolution/pink-autonomous-evolution.js','utf8');
  assert.match(evolution,/pinkevolution:issue/);
  assert.match(evolution,/user_correction/);

  console.log('Pink operational senses contract: OK');
})().catch(e=>{console.error(e);process.exit(1)});
