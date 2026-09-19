const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
export const SpatialQuality=Object.freeze({LITE:'lite',BALANCED:'balanced',ULTRA:'ultra'});
export const SpatialInput=Object.freeze({POINTER:'pointer',TOUCH:'touch',CAMERA:'camera',KEYBOARD:'keyboard'});

export class PinkSpatialKernel{
  constructor({quality=SpatialQuality.BALANCED,reducedMotion=false}={}){
    if(!Object.values(SpatialQuality).includes(quality))throw new TypeError('invalid spatial quality');
    this.quality=quality;this.reducedMotion=Boolean(reducedMotion);this.cameraPermission='not-requested';
    this.pose={x:0,y:0,z:0,source:SpatialInput.POINTER,confidence:1};this.targets=new Map();this.events=[];
  }
  registerTarget(input={}){
    const id=clean(input.id,160),label=clean(input.label||id,180);if(!id||!label)throw new TypeError('spatial target requires id and label');
    const item=Object.freeze({id,label,kind:clean(input.kind||'app',80),action:clean(input.action||'focus',80),projectId:clean(input.projectId,180)||null,enabled:input.enabled!==false});
    this.targets.set(id,item);return structuredClone(item);
  }
  setQuality(value){
    if(!Object.values(SpatialQuality).includes(value))throw new TypeError('invalid spatial quality');
    this.quality=value;return this.snapshot();
  }
  setReducedMotion(value){this.reducedMotion=Boolean(value);return this.snapshot();}
  setPointer({x=0,y=0,source=SpatialInput.POINTER}={}){
    if(![SpatialInput.POINTER,SpatialInput.TOUCH,SpatialInput.KEYBOARD].includes(source))throw new TypeError('invalid pointer source');
    this.pose={x:clamp(Number(x)||0,-1,1),y:clamp(Number(y)||0,-1,1),z:0,source,confidence:1};return this.snapshot();
  }
  setCameraPermission(value){
    if(!['not-requested','granted','denied','stopped'].includes(value))throw new TypeError('invalid camera permission state');
    this.cameraPermission=value;if(value!=='granted'&&this.pose.source===SpatialInput.CAMERA)this.pose={x:0,y:0,z:0,source:SpatialInput.POINTER,confidence:1};return value;
  }
  setHeadPose({x=0,y=0,z=0,confidence=0}={}){
    if(this.cameraPermission!=='granted')throw new Error('camera permission required');
    const c=clamp(Number(confidence)||0,0,1);if(c<.5)return this.snapshot();
    this.pose={x:clamp(Number(x)||0,-1,1),y:clamp(Number(y)||0,-1,1),z:clamp(Number(z)||0,-1,1),source:SpatialInput.CAMERA,confidence:c};return this.snapshot();
  }
  selectTarget(id,{evidenceRefs=[]}={}){
    const target=this.targets.get(clean(id,160));if(!target||!target.enabled)throw new Error('spatial target unavailable');
    const event=Object.freeze({type:'spatial-select',targetId:target.id,action:target.action,projectId:target.projectId,execute:false,evidenceRefs:Object.freeze((evidenceRefs||[]).slice(0,16).map(x=>clean(x,240)).filter(Boolean)),createdAt:new Date().toISOString()});
    this.events.push(event);if(this.events.length>100)this.events.shift();return structuredClone(event);
  }
  sceneTransform(){
    const q=this.quality===SpatialQuality.ULTRA?1:this.quality===SpatialQuality.LITE?.45:.72;
    const motion=this.reducedMotion?0:.12*q;
    return Object.freeze({parallaxX:this.pose.x*motion,parallaxY:-this.pose.y*motion,depth:this.pose.z*.08*q,maxDpr:this.quality===SpatialQuality.ULTRA?1.75:this.quality===SpatialQuality.LITE?1:1.35,particleBudget:this.quality===SpatialQuality.ULTRA?900:this.quality===SpatialQuality.LITE?240:480});
  }
  snapshot(){return {quality:this.quality,reducedMotion:this.reducedMotion,cameraPermission:this.cameraPermission,pose:{...this.pose},targets:[...this.targets.values()].map(x=>structuredClone(x)),recentEvents:this.events.slice(-20).map(x=>structuredClone(x)),transform:this.sceneTransform()};}
}
export function createPinkSpatialKernel(options={}){
 const k=new PinkSpatialKernel(options);
 for(const x of [{id:'pink-core',label:'Pink Core',kind:'core'},{id:'mission-control',label:'Mission Control'},{id:'agent-mesh',label:'Agent Mesh'},{id:'nexora',label:'Nexora',kind:'engineering'},{id:'cvm',label:'CVM Pipe Control',kind:'project'},{id:'security',label:'Security Center',kind:'security'},{id:'evolution-lab',label:'Evolution Lab',kind:'lab'}])k.registerTarget(x);
 return k;
}
