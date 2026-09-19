const MP_VERSION='1.0.1';
const MP_MODULE=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/+esm`;
const MP_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const FACE_MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class PinkSpatialPresence {
  constructor({runtime,videoResolver=()=>document.querySelector('#pinkVisionCamera')}={}){
    if(!runtime?.spatial)throw new TypeError('PinkSpatialPresence requires runtime.spatial');
    this.runtime=runtime;this.videoResolver=videoResolver;this.landmarker=null;this.active=false;this.raf=0;this.busy=false;this.last=0;this.startedCamera=false;this.baselineWidth=null;this.error=null;
  }
  async ensureLandmarker(){
    if(this.landmarker)return this.landmarker;
    const mod=await import(MP_MODULE);const vision=await mod.FilesetResolver.forVisionTasks(MP_WASM);
    const opts={baseOptions:{modelAssetPath:FACE_MODEL,delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.5};
    try{this.landmarker=await mod.FaceLandmarker.createFromOptions(vision,opts)}catch(_){opts.baseOptions.delegate='CPU';this.landmarker=await mod.FaceLandmarker.createFromOptions(vision,opts)}
    return this.landmarker;
  }
  poseFromLandmarks(points=[]){
    if(!points.length)return null;
    let minX=1,maxX=0,minY=1,maxY=0;
    for(const p of points){if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
    const width=maxX-minX,height=maxY-minY;if(width<=0||height<=0)return null;
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    if(!this.baselineWidth)this.baselineWidth=width;
    const z=Math.max(-1,Math.min(1,(width/this.baselineWidth-1)*2.5));
    return {x:Math.max(-1,Math.min(1,(.5-cx)*2.2)),y:Math.max(-1,Math.min(1,(cy-.5)*2.2)),z,confidence:1};
  }
  async enable(){
    if(this.active)return true;
    if(!window.PinkVision?.start)throw new Error('Pink Vision unavailable');
    const wasActive=Boolean(window.PinkVision.active);
    try{
      if(!wasActive){await window.PinkVision.start();this.startedCamera=true}
      this.runtime.spatial.setCameraPermission('granted');await this.ensureLandmarker();this.active=true;this.error=null;this.raf=globalThis.requestAnimationFrame?.(t=>this.loop(t))||0;return true;
    }catch(error){
      this.error=String(error?.message||error);this.runtime.spatial.setCameraPermission(error?.name==='NotAllowedError'?'denied':'stopped');
      if(this.startedCamera){window.PinkVision?.stop?.();this.startedCamera=false}
      throw error;
    }
  }
  loop(now){
    if(!this.active)return;this.raf=globalThis.requestAnimationFrame?.(t=>this.loop(t))||0;
    if(document.hidden||this.busy||now-this.last<66)return;
    const video=this.videoResolver();if(!video||video.readyState<2||!this.landmarker)return;
    this.last=now;this.busy=true;
    try{
      const result=this.landmarker.detectForVideo(video,now);const pose=this.poseFromLandmarks(result?.faceLandmarks?.[0]||[]);
      if(pose)this.runtime.spatial.setHeadPose(pose);
    }catch(error){this.error=String(error?.message||error)}
    finally{this.busy=false}
  }
  disable({stopCamera=true}={}){
    this.active=false;globalThis.cancelAnimationFrame?.(this.raf);this.raf=0;this.runtime.spatial.setCameraPermission('stopped');this.baselineWidth=null;
    if(stopCamera&&this.startedCamera){window.PinkVision?.stop?.();this.startedCamera=false}
  }
  destroy(){this.disable({stopCamera:true});try{this.landmarker?.close?.()}catch(_){}this.landmarker=null}
  snapshot(){return {active:this.active,processing:'on-device',model:'mediapipe-face-landmarker',cameraPermission:this.runtime.spatial.snapshot().cameraPermission,error:this.error};}
}
