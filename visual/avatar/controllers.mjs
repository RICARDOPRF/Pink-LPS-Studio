// Provider-neutral avatar controls. No microphone, persistence or credentials.
export const STATES = Object.freeze(['idle','listening','thinking','speaking','executing','reviewing','presenting','success','error']);
const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export class StateController {
  constructor(){ this.current='idle'; }
  set(value){ if(!STATES.includes(value)) return false; this.current=value; return true; }
}

export class AudioReactiveController {
  constructor(){ this.value=0; this.at=-Infinity; }
  push(value, now){ this.value=clamp(value); this.at=now; }
  sample(now){ return now-this.at>=0 && now-this.at<250 ? this.value : 0; }
  reset(){ this.value=0; this.at=-Infinity; }
}

export class VisemeController {
  constructor(){ this.values={}; this.until=-Infinity; }
  push(values, now, duration=120){
    this.values=Object.fromEntries(Object.entries(values || {}).filter(([key])=>['aa','ee','ih','oh','ou'].includes(key)).map(([key,value])=>[key,clamp(value)]));
    this.until=now+Math.max(0,Math.min(Number.isFinite(duration)?duration:120,500));
  }
  sample(now){ return now<this.until?this.values:{}; }
  reset(){ this.values={};this.until=-Infinity; }
}

export class FacialController {
  constructor(root, mapping={}){
    this.targets=new Map();this.originals=[];
    root.traverse(object=>{
      if(!object.morphTargetDictionary || !object.morphTargetInfluences) return;
      for(const [channel, names] of Object.entries(mapping)){
        for(const name of Array.isArray(names)?names:[names]){
          const index=object.morphTargetDictionary[name];
          if(!Number.isInteger(index) || index<0 || index>=object.morphTargetInfluences.length) continue;
          const list=this.targets.get(channel)||[];
          list.push({object,index});this.targets.set(channel,list);
          this.originals.push({object,index,value:object.morphTargetInfluences[index]});
        }
      }
    });
  }
  apply(values){
    const combined=new Map();
    for(const [channel,targets] of this.targets){
      for(const {object,index} of targets){
        if(!combined.has(object)) combined.set(object,new Map());
        const slots=combined.get(object);slots.set(index,Math.max(slots.get(index)||0,clamp(values[channel])));
      }
    }
    for(const [object,slots] of combined) for(const [index,value] of slots) object.morphTargetInfluences[index]=value;
  }
  reset(){ for(const {object,index,value} of this.originals) object.morphTargetInfluences[index]=value; }
}

export class AnimationController {
  constructor(root, THREE, clips=[], mapping={}){
    this.root=root;this.mixer=new THREE.AnimationMixer(root);this.clips=new Map(clips.map(clip=>[clip.name,clip]));this.mapping=mapping;this.current=null;this.state=null;this.reduced=null;
  }
  set(state,reducedMotion){
    if(state===this.state && reducedMotion===this.reduced) return;
    this.state=state;this.reduced=reducedMotion;
    const clip=this.clips.get(this.mapping[state]);
    const next=!reducedMotion&&clip?this.mixer.clipAction(clip):null;
    if(next===this.current) return;
    // Stop previous tracks first so returning to idle cannot retain an executing pose.
    this.mixer.stopAllAction();this.current=next;
    next?.reset().play();
  }
  update(dt){ this.mixer.update(Math.max(0,Math.min(dt,.1))); }
  dispose(){ this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root); }
}

export function disposeModel(root){
  const resources=new Set();
  root?.traverse(object=>{
    if(object.geometry) resources.add(object.geometry);
    if(object.skeleton) resources.add(object.skeleton);
    for(const material of (Array.isArray(object.material)?object.material:[object.material])){
      if(!material) continue;
      resources.add(material);
      for(const value of Object.values(material)) if(value?.isTexture) resources.add(value);
    }
  });
  const images=new Set();
  for(const resource of resources){
    if(resource.isTexture && resource.image?.close) images.add(resource.image);
    resource.dispose?.();
  }
  for(const image of images) image.close();
}

export class AvatarLoader {
  constructor({parse,fetchImpl=globalThis.fetch,baseURL,timeoutMs=15000,maxBytes=20*1024*1024}){
    this.parse=parse;this.fetch=fetchImpl;this.baseURL=baseURL;this.timeoutMs=timeoutMs;this.maxBytes=maxBytes;this.pending=null;this.generation=0;
  }
  cancel(){ this.generation++;this.pending?.abort();this.pending=null; }
  async load(config){
    this.cancel();const generation=this.generation;
    if(!config?.url) return null;
    const base=new URL(this.baseURL), url=new URL(config.url,base);
    if(url.origin!==base.origin || !['http:','https:'].includes(url.protocol) || !url.pathname.toLowerCase().endsWith('.glb') || url.username || url.password || url.search || url.hash) throw new Error('Use a same-origin GLB asset without query or credentials.');
    if(!config.license?.trim() || !config.source?.trim()) throw new Error('Avatar license and source are required.');
    const abort=new AbortController();this.pending=abort;
    const timer=setTimeout(()=>abort.abort(),this.timeoutMs);
    try{
      const response=await this.fetch(url.href,{signal:abort.signal,redirect:'error',credentials:'omit'});
      if(!response.ok || !response.body || Number(response.headers.get('content-length'))>this.maxBytes) throw new Error('Avatar response rejected.');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>this.maxBytes)throw new Error('Avatar exceeds size limit.');chunks.push(value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      validateGLB(bytes);
      let cancelled=false, onAbort;
      const parsing=Promise.resolve().then(()=>this.parse(bytes.buffer));
      const aborted=new Promise((_,reject)=>{
        onAbort=()=>{cancelled=true;reject(new Error('Avatar load cancelled or timed out.'));};
        abort.signal.addEventListener('abort',onAbort,{once:true});
        if(abort.signal.aborted)onAbort();
      });
      parsing.then(model=>{if(cancelled)disposeModel(model?.scene);},()=>{});
      let model;
      try{model=await Promise.race([parsing,aborted]);}
      finally{abort.signal.removeEventListener('abort',onAbort);}
      if(abort.signal.aborted || generation!==this.generation){disposeModel(model?.scene);throw new Error('Avatar load cancelled or timed out.');}
      return model;
    }finally{clearTimeout(timer);if(this.pending===abort)this.pending=null;}
  }
}

export function validateGLB(bytes){
  if(bytes.byteLength<20) throw new Error('Invalid GLB.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.byteLength) throw new Error('Invalid GLB header.');
  const length=view.getUint32(12,true);
  if(view.getUint32(16,true)!==0x4e4f534a || length%4 || length>bytes.byteLength-20) throw new Error('Invalid GLB JSON chunk.');
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length)));
  // Self-contained models only. Parsing must not trigger further URL requests.
  if([...(json.buffers||[]),...(json.images||[])].some(item=>item.uri!==undefined)) throw new Error('External or embedded URI resources are not supported; use GLB bufferViews.');
  if(Object.keys(json.extensions||{}).some(key=>/VRM/i.test(key))) throw new Error('VRM requires a dedicated adapter.');
  if((json.extensionsRequired||[]).length) throw new Error('Required GLB extensions must be reviewed before use.');
  return json;
}

export class AvatarController {
  constructor({THREE,scene,loader,config,onStatus=()=>{}}){
    this.THREE=THREE;this.scene=scene;this.loader=loader;this.config=config;this.onStatus=onStatus;
    this.state=new StateController();this.audio=new AudioReactiveController();this.visemes=new VisemeController();
    this.status='fallback';this.root=null;this.destroyed=false;this.generation=0;this.time=0;
  }
  async load(){
    const generation=++this.generation;
    if(this.destroyed || !this.config.url) return false;
    this.onStatus('loading');
    let model;
    try{
      model=await this.loader.load(this.config);
      if(this.destroyed || generation!==this.generation){disposeModel(model?.scene);return false;}
      if(!model?.scene) throw new Error('Avatar has no scene.');
      this.release();this.root=model.scene;
      this.group=new this.THREE.Group();this.group.add(this.root);
      const scale=this.config.scale ?? 1;
      if(!Number.isFinite(scale)||scale<=0||scale>100) throw new Error('Invalid avatar scale.');
      this.group.scale.setScalar(scale);
      const position=this.config.position||[0,-1.8,0];
      if(position.length!==3||!position.every(Number.isFinite)) throw new Error('Invalid avatar position.');
      this.group.position.set(...position);this.baseY=position[1];
      this.face=new FacialController(this.root,this.config.morphs);
      this.animation=new AnimationController(this.root,this.THREE,model.animations,this.config.animations);
      const bones=this.config.bones||{};
      this.bones=Object.fromEntries(Object.entries(bones).map(([key,name])=>{const bone=this.root.getObjectByName(name);return [key,bone?{bone,rotation:bone.rotation.clone()}:null];}));
      this.scene.add(this.group);this.status='ready';this.onStatus('ready');return true;
    }catch(error){
      if(generation!==this.generation||this.destroyed)return false;
      if(model?.scene!==this.root)disposeModel(model?.scene);
      this.release();this.status='fallback';this.onStatus('fallback',error.message);return false;
    }
  }
  setState(value){ if(this.state.set(value)&&value!=='speaking'){this.audio.reset();this.visemes.reset();} }
  update(dt,now,{reducedMotion=false,level}={}){
    if(!this.root || this.destroyed) return;
    const state=this.state.current;
    this.animation.set(state,reducedMotion);this.animation.update(dt);
    if(!reducedMotion)this.time+=Math.max(0,Math.min(dt,.1));
    const t=this.time,blinkPhase=t%4.6;
    const blink=!reducedMotion&&blinkPhase<.18?Math.sin(blinkPhase/.18*Math.PI):0;
    if(Number.isFinite(level)&&state==='speaking')this.audio.push(level,now);
    const mouth=state==='speaking'?this.audio.sample(now):0;
    const visemes=state==='speaking'?this.visemes.sample(now):{};
    this.face.apply({blink,blinkLeft:blink,blinkRight:blink,smile:state==='success'?.35:state==='speaking'?.08:0,mouthOpen:mouth,aa:visemes.aa??mouth,...visemes});
    this.group.position.y=this.baseY+(reducedMotion?0:Math.sin(t*1.4)*.008);
    // Procedural bones are opt-in and should not also have animation tracks.
    for(const [key,entry] of Object.entries(this.bones)){
      if(!entry)continue;entry.bone.rotation.copy(entry.rotation);
      if(reducedMotion)continue;
      if(key==='head'){entry.bone.rotation.y+=Math.sin(t*.55)*.025;entry.bone.rotation.x+=state==='listening'?-.035:Math.sin(t*.7)*.012;}
      if(key==='leftEye'||key==='rightEye')entry.bone.rotation.y+=Math.sin(t*.4)*.025;
    }
  }
  release(){
    this.animation?.dispose();this.face?.reset();
    if(this.group)this.scene.remove(this.group);
    disposeModel(this.root);this.root=null;this.group=null;this.animation=null;this.face=null;
  }
  snapshot(){return {status:this.status,state:this.state.current,hasModel:!!this.root,morphChannels:this.face?[...this.face.targets.keys()]:[],audioMode:'amplitude-or-explicit-visemes'};}
  destroy(){this.destroyed=true;this.generation++;this.loader.cancel();this.release();this.audio.reset();this.visemes.reset();this.status='destroyed';}
}
