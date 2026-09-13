import assert from 'node:assert/strict';
import {StateController,AudioReactiveController,VisemeController,FacialController,AvatarLoader,AvatarController,validateGLB} from '../visual/avatar/controllers.mjs';
const state=new StateController();assert.equal(state.set('invented'),false);assert.equal(state.current,'idle');assert.equal(state.set('reviewing'),true);
const audio=new AudioReactiveController();audio.push(2,100);assert.equal(audio.sample(120),1);assert.equal(audio.sample(350),0);audio.push(NaN,400);assert.equal(audio.sample(410),0);
const visemes=new VisemeController();visemes.push({aa:2,evil:1},10,100);assert.deepEqual(visemes.sample(20),{aa:1});assert.deepEqual(visemes.sample(110),{});
const mesh={morphTargetDictionary:{jawOpen:0,eyeBlinkLeft:1},morphTargetInfluences:[.2,.1]};
const face=new FacialController({traverse(fn){fn(mesh)}},{mouthOpen:['jawOpen'],aa:['jawOpen'],blinkLeft:['eyeBlinkLeft'],missing:['absent']});
face.apply({mouthOpen:.8,aa:.4,blinkLeft:1});assert.deepEqual(mesh.morphTargetInfluences,[.8,1]);face.apply({});assert.deepEqual(mesh.morphTargetInfluences,[0,0]);face.reset();assert.deepEqual(mesh.morphTargetInfluences,[.2,.1]);
function glb(json={asset:{version:'2.0'}}){let str=JSON.stringify(json);str+=' '.repeat((4-str.length%4)%4);const bytes=new Uint8Array(20+str.length),view=new DataView(bytes.buffer);[0x46546c67,2,bytes.length,str.length,0x4e4f534a].forEach((value,i)=>view.setUint32(i*4,value,true));bytes.set(new TextEncoder().encode(str),20);return bytes;}
assert.equal(validateGLB(glb()).asset.version,'2.0');assert.throws(()=>validateGLB(glb({images:[{uri:'https://example.org/image'}]})),/resources/);
assert.throws(()=>validateGLB(glb({extensions:{VRMC_vrm:{}}})),/VRM/);
const config={url:'pink.glb',license:'Original LPS',source:'LPS'};
let requests=0,disposed=0;
const model=()=>({scene:{traverse(fn){fn({geometry:{dispose(){disposed++}}})}}});
const loader=new AvatarLoader({baseURL:'https://example.org/pink/',fetchImpl:async()=>{requests++;return new Response(glb())},parse:async()=>model()});
assert.equal(await loader.load({url:null}),null);assert.equal(requests,0);
await assert.rejects(loader.load({...config,url:'https://elsewhere.test/a.glb'}));assert.equal(requests,0);
await assert.rejects(loader.load({...config,license:''}));assert.equal(requests,0);
assert.ok((await loader.load(config)).scene);
const tooBig=new AvatarLoader({baseURL:'https://example.org/',maxBytes:8,fetchImpl:async()=>new Response(glb()),parse:()=>{throw Error('must not parse')}});await assert.rejects(tooBig.load(config),/size limit/);
let finish;
const slow=new AvatarLoader({baseURL:'https://example.org/',timeoutMs:15,fetchImpl:async()=>new Response(glb()),parse:()=>new Promise(resolve=>{finish=resolve})});
await assert.rejects(slow.load(config),/timed out/);finish(model());await new Promise(resolve=>setImmediate(resolve));assert.equal(disposed,1);
// Model lifecycle tested without a GPU; rotations/morph slots are real mutable values.
class Rotation{constructor(){this.x=0;this.y=0}clone(){const r=new Rotation();r.copy(this);return r}copy(r){this.x=r.x;this.y=r.y;return this}}
class Group{constructor(){this.children=[];this.position={y:0,set:(x,y,z)=>{this.position.y=y}};this.scale={setScalar(){}};this.rotation=new Rotation()}add(x){this.children.push(x)}remove(x){this.children=this.children.filter(c=>c!==x)}traverse(fn){fn(this);this.children.forEach(c=>c.traverse(fn))}getObjectByName(){return undefined}}
class Mixer{stopAllAction(){}uncacheRoot(){}update(){}}
const root=new Group();root.morphTargetDictionary={jawOpen:0};root.morphTargetInfluences=[0];
const scene=new Group();const avatar=new AvatarController({THREE:{Group,AnimationMixer:Mixer},scene,loader:{load:async()=>({scene:root,animations:[]}),cancel(){}},config:{...config,morphs:{mouthOpen:'jawOpen'}}});
assert.equal(await avatar.load(),true);avatar.setState('speaking');avatar.update(.016,100,{level:.7});assert.equal(root.morphTargetInfluences[0],.7);
avatar.update(.016,400,{});assert.equal(root.morphTargetInfluences[0],0);avatar.setState('idle');avatar.update(.016,410,{level:1});assert.equal(root.morphTargetInfluences[0],0);
avatar.destroy();assert.equal(scene.children.length,0);assert.equal(avatar.snapshot().status,'destroyed');
console.log('PASS: state validation, stale audio/visemes, morph mapping/reset, GLB rejection, bounded load, late parse disposal and avatar lifecycle (no GPU).');
