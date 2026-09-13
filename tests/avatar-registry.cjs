const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'../visual/pink-avatar-registry.js'),'utf8');

class Stage{constructor(){this.dataset={}}}
const stage=new Stage();
const doc={querySelector:selector=>selector==='#pinkStage'?stage:null};
const win=new EventTarget();
let fetchRows=[];
let loadedConfig=null;
let issues=0;

const context={
  window:win,
  document:doc,
  console,
  URL,
  Event,
  CustomEvent:class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}},
  fetch:async()=>({ok:true,status:200,json:async()=>fetchRows}),
  setTimeout,
  clearTimeout
};
win.PinkAvatar3D={
  snapshot(){return {mode:'portrait-fallback'}},
  async loadModel(config){loadedConfig=config;return {mode:'glb-model'}}
};
win.PinkEvolution={recordIssue(){issues+=1}};

vm.runInNewContext(source,context);
const api=win.PinkAvatarRegistry;
assert.ok(api,'PinkAvatarRegistry API should exist');

(async()=>{
  await api.refresh();
  assert.equal(api.snapshot().status,'no-active-model');
  assert.equal(api.snapshot().asset,null);
  assert.equal(api.snapshot().fallbackActive,true);

  fetchRows=[{
    slug:'pink-main',version:'v1',bucket_id:'pink-assets',
    object_path:'avatars/pink/v1/pink.glb',format:'glb',status:'active',
    metadata:{rig:'humanoid'},updated_at:'2026-09-13T00:00:00Z'
  }];
  await api.refresh();
  let snap=api.snapshot();
  assert.equal(snap.status,'adapter-pending');
  assert.equal(snap.asset.slug,'pink-main');
  assert.match(snap.url,/\/storage\/v1\/object\/public\/pink-assets\/avatars\/pink\/v1\/pink\.glb$/);
  assert.equal(loadedConfig,null,'model must not load without adapter');

  win.PinkAvatarModelAdapter={load:async()=>({})};
  await api.refresh();
  snap=api.snapshot();
  assert.equal(snap.status,'model-loaded');
  assert.ok(loadedConfig,'active asset should be handed to avatar loader');
  assert.equal(loadedConfig.format,'glb');
  assert.equal(loadedConfig.asset.version,'v1');
  assert.equal(issues,0);

  api.destroy();
  assert.equal(api.snapshot().status,'destroyed');
  console.log('PASS: Supabase avatar registry preserves fallback and activates a valid 3D asset when adapter is ready.');
})().catch(error=>{console.error(error);process.exitCode=1});
