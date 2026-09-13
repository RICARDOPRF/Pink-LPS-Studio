// Pink Runtime Resilience V1 — clean-room import for V7.
// No private keys, shell commands, or provider network calls.
(() => {
  const providers = new Map();
  const audio = { listeningEnabled:true, wakeOnly:false, speakerMuted:false };
  let fps=0,frames=0,last=performance.now();

  function registerProvider(id,{priority=100,capabilities=[],enabled=true}={}){
    providers.set(id,{id,priority,capabilities:[...new Set(capabilities)],enabled,failures:0,successes:0,cooldownUntil:0,lastError:null});
  }
  function providerSuccess(id){const p=providers.get(id);if(!p)return;p.successes++;p.failures=Math.max(0,p.failures-1);p.cooldownUntil=0;p.lastError=null;}
  function providerFailure(id,error,{cooldownMs=60000}={}){const p=providers.get(id);if(!p)return;p.failures++;p.lastError=String(error?.message||error||'unknown').slice(0,240);p.cooldownUntil=Date.now()+cooldownMs*Math.min(4,Math.max(1,p.failures));}
  function chooseProvider(capability,preferred){
    const healthy=p=>p.enabled&&p.cooldownUntil<=Date.now()&&(!capability||p.capabilities.includes(capability));
    if(preferred&&healthy(providers.get(preferred)))return preferred;
    return [...providers.values()].filter(healthy).sort((a,b)=>(a.priority-b.priority)||(a.failures-b.failures))[0]?.id||null;
  }
  function setListening(enabled,{wakeOnly=false}={}){audio.listeningEnabled=!!enabled;audio.wakeOnly=!enabled&&!!wakeOnly;emitAudio();}
  function setSpeakerMuted(muted=true){audio.speakerMuted=!!muted;emitAudio();}
  function emitAudio(){window.dispatchEvent(new CustomEvent('pink:audio-mode',{detail:{...audio}}));}
  function tick(t){frames++;if(t-last>=1000){fps=Math.round(frames*1000/(t-last));frames=0;last=t;}requestAnimationFrame(tick)} requestAnimationFrame(tick);
  function health(){
    const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    let webgl=false;try{const el=document.createElement('canvas');webgl=!!(el.getContext('webgl2')||el.getContext('webgl'));}catch(_){}
    return {at:new Date().toISOString(),online:navigator.onLine,fps,cores:navigator.hardwareConcurrency||null,deviceMemoryGB:navigator.deviceMemory||null,webgl,mediaDevices:!!navigator.mediaDevices?.getUserMedia,connection:c?{effectiveType:c.effectiveType||null,downlink:c.downlink||null,rtt:c.rtt||null}:null};
  }
  window.PinkRuntimeResilience={
    registerProvider,providerSuccess,providerFailure,chooseProvider,
    setListening,setSpeakerMuted,
    snapshot:()=>({providers:[...providers.values()].map(p=>({...p})),audio:{...audio},health:health()})
  };
})();
