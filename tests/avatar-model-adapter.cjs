const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'../visual/pink-avatar-model-adapter.js'),'utf8');
const win=new EventTarget();
let ready=null;
win.addEventListener('pinkavatar:adapter-ready',event=>{ready=event.detail});
const stage={dataset:{},style:{setProperty(){},removeProperty(){}},prepend(){}};
const context={
  window:win,
  document:{querySelector:selector=>selector==='#pinkStage'?stage:null,createElement(){return {className:'',setAttribute(){},remove(){}}}},
  navigator:{userAgent:'Node',deviceMemory:8},
  console,
  Event,
  EventTarget,
  CustomEvent:class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}},
  setTimeout,
  clearTimeout
};

vm.runInNewContext(source,context);
const api=win.PinkAvatarModelAdapter;
assert.ok(api,'PinkAvatarModelAdapter should exist');
assert.equal(api.versions.three,'0.180.0');
assert.deepEqual(Array.from(ready.formats),['glb','gltf','vrm']);

function node(name,extra={}){return {name,...extra}}
const head=node('Head',{isBone:true,rotation:{x:0,y:0,z:0},position:{x:0,y:0,z:0}});
const jaw=node('Lower_Jaw',{isBone:true,rotation:{x:0,y:0,z:0},position:{x:0,y:0,z:0}});
const mesh=node('Face',{
  isMesh:true,
  isSkinnedMesh:true,
  morphTargetDictionary:{Blink:0,viseme_AA:1,Mouth_O:2,Smile:3},
  morphTargetInfluences:[0,0,0,0]
});
const root={traverse(fn){[head,jaw,mesh].forEach(fn)}};
const caps=api.inspectScene(root,null);

assert.equal(caps.bones.head,head);
assert.equal(caps.bones.jaw,jaw);
assert.equal(caps.morphs.blink[0].mesh,mesh);
assert.equal(caps.morphs.aa[0].index,1);
assert.equal(caps.morphs.oh[0].index,2);
assert.equal(caps.morphs.happy[0].index,3);
assert.equal(caps.hasFaceRig,true);
assert.equal(caps.hasHumanoidRig,true);
assert.equal(caps.rigLevel,'facial-humanoid');
assert.equal(api.normalizeKey('Lower_Jaw.001'),'lowerjaw001');
console.log('PASS: Pink avatar model adapter discovers humanoid bones and facial morph targets.');
