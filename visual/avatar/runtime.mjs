import {AvatarController,AvatarLoader} from './controllers.mjs';
import {avatarConfig} from './config.mjs';

export function createAvatarRuntime({THREE,scene,stage,invalidate}){
  let disposed=false,controller=null,lights=[];
  const showFallback=()=>stage.classList.remove('pink-avatar-ready');
  const api={
    async start(){
      if(!avatarConfig.url || disposed) return;
      try{
        const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
        if(disposed)return;
        const manager=new THREE.LoadingManager();
        manager.setURLModifier(url=>{if(!url.startsWith('blob:'))throw new Error('Avatar dependencies must be self-contained.');return url;});
        const gltf=new GLTFLoader(manager);
        const loader=new AvatarLoader({baseURL:document.baseURI,parse:buffer=>new Promise((resolve,reject)=>gltf.parse(buffer,'',resolve,reject))});
        controller=new AvatarController({THREE,scene,loader,config:avatarConfig,onStatus(status,error){
          stage.classList.toggle('pink-avatar-ready',status==='ready');
          stage.dispatchEvent(new CustomEvent('pinkavatar:status',{detail:{status,error}}));
          invalidate();
        }});
        // Light the model only. Existing unlit presence particles remain unchanged.
        lights=[new THREE.HemisphereLight(0xcdeeff,0x352044,2),new THREE.DirectionalLight(0xffffff,2)];
        lights[1].position.set(2,3,4);lights.forEach(light=>scene.add(light));
        await controller.load();
      }catch(error){showFallback();stage.dispatchEvent(new CustomEvent('pinkavatar:status',{detail:{status:'fallback',error:String(error.message)}}));}
    },
    update(dt,now,options){
      if(disposed||!controller)return;
      controller.setState(stage.dataset.state||'idle');
      let level;
      // Read the existing conversation's output meter; never request microphone access.
      try{const voice=window.PinkVoice;if(voice?.mode==='elevenlabs')level=voice.getConversation()?.getOutputVolume?.();}catch{/* Missing output meter keeps the mouth closed. */}
      controller.update(dt,now,{...options,level});
    },
    snapshot:()=>controller?.snapshot()||{status:disposed?'destroyed':'fallback',hasModel:false,reason:'model-not-configured'},
    pushVisemes(values,duration){controller?.visemes.push(values,performance.now(),duration);invalidate();},
    destroy(){disposed=true;controller?.destroy();lights.forEach(light=>scene.remove(light));lights=[];showFallback();}
  };
  return api;
}
