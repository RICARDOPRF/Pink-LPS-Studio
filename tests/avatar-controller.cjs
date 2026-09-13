const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'../visual/pink-avatar-controller.js'),'utf8');

class ClassList{
  constructor(){this.items=new Set()}
  add(...names){names.forEach(name=>this.items.add(name))}
  remove(...names){names.forEach(name=>this.items.delete(name))}
  contains(name){return this.items.has(name)}
}
class Style{
  constructor(){this.values=new Map()}
  setProperty(name,value){this.values.set(name,String(value))}
  removeProperty(name){this.values.delete(name)}
  getPropertyValue(name){return this.values.get(name)||''}
}
class Element extends EventTarget{
  constructor(){super();this.dataset={state:'idle'};this.classList=new ClassList();this.style=new Style()}
  getBoundingClientRect(){return {left:0,top:0,width:400,height:600}}
}
class MQ extends EventTarget{constructor(){super();this.matches=false}}

const stage=new Element();
const doc=new EventTarget();doc.hidden=false;doc.querySelector=selector=>selector==='#pinkStage'?stage:null;
const mq=new MQ();
const win=new EventTarget();win.matchMedia=()=>mq;
let rafId=0;const rafQueue=new Map();

const context={
  window:win,
  document:doc,
  console,
  Math,
  Uint8Array,
  setTimeout,
  clearTimeout,
  Event,
  CustomEvent:class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}},
  MutationObserver:class{observe(){}disconnect(){}},
  requestAnimationFrame:fn=>{const id=++rafId;rafQueue.set(id,fn);return id},
  cancelAnimationFrame:id=>rafQueue.delete(id)
};

vm.runInNewContext(source,context);
const api=win.PinkAvatar3D;
assert.ok(api,'PinkAvatar3D API should exist');
assert.equal(api.snapshot().mode,'portrait-fallback');
assert.equal(api.snapshot().hasModel,false);
assert.equal(stage.classList.contains('pink-avatar-runtime'),true);

api.setState('speaking');
api.setVoiceFrame({level:.52,viseme:'oh',weight:.64,jaw:.48});
const jobs=[...rafQueue.values()];rafQueue.clear();jobs.forEach(fn=>fn(100));
assert.equal(api.snapshot().state,'speaking');
assert.equal(api.snapshot().viseme,'oh');
assert.equal(api.snapshot().externalVoiceFrame,true);
assert.equal(api.snapshot().jaw,.48);
assert.ok(Number(stage.style.getPropertyValue('--pink-mouth-open'))>0);
assert.ok(stage.style.getPropertyValue('--pink-jaw-y').endsWith('px'));
assert.ok(stage.style.getPropertyValue('--pink-avatar-scale'),'breathing transform should be populated');

api.releaseVoiceFrame();
assert.equal(api.snapshot().externalVoiceFrame,false);

api.setViseme('aa',.8,.7);
assert.equal(api.snapshot().viseme,'aa');
assert.equal(api.snapshot().visemeWeight,.8);
assert.equal(api.snapshot().jaw,.7);

api.destroy();
assert.equal(stage.classList.contains('pink-avatar-runtime'),false);
console.log('PASS: avatar state, external voice frame, jaw/viseme controls and cleanup.');
