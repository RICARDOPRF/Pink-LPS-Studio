// Pink Vision — explicit opt-in camera, on-demand frames, server-side Gemini multimodal analysis.
(() => {
  'use strict';
  const cfg=window.PinkPublicConfig?.supabase||{};
  const FN=cfg.functions?.vision||'pink-vision';
  let stream=null,video=null,canvas=null,active=false,busy=false;
  function ensure(){
    if(video&&canvas)return;
    const host=document.createElement('div');host.id='pinkVisionRuntime';host.hidden=true;
    host.innerHTML='<video id="pinkVisionCamera" autoplay playsinline muted></video><canvas id="pinkVisionCanvas"></canvas>';
    document.body.appendChild(host);video=host.querySelector('video');canvas=host.querySelector('canvas');
  }
  function emit(type,detail={}){window.dispatchEvent(new CustomEvent(`pinkvision:${type}`,{detail}))}
  async function start(){
    ensure();if(active)return true;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera_api_unavailable');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();active=true;emit('state',{active:true});return true;
  }
  function stop(){stream?.getTracks?.().forEach(t=>t.stop());stream=null;if(video)video.srcObject=null;active=false;emit('state',{active:false})}
  async function frame(){
    if(!active)await start();if(!video.videoWidth)await new Promise(r=>setTimeout(r,350));
    const max=1280,scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.78).split(',')[1];
  }
  async function observe(prompt='Descreva o que você está vendo. Aponte objetos, texto visível, contexto e detalhes úteis. Não invente identidades. Se a identidade de alguém não estiver fornecida no contexto, descreva apenas como pessoa.'){
    if(busy)throw new Error('vision_busy');busy=true;emit('state',{active,busy:true});
    try{
      if(!cfg.url||!cfg.anonKey)throw new Error('supabase_config_missing');const imageBase64=await frame();
      const r=await fetch(`${cfg.url}/functions/v1/${FN}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:`Bearer ${cfg.anonKey}`},body:JSON.stringify({imageBase64,mimeType:'image/jpeg',prompt})});
      const data=await r.json().catch(()=>({}));if(!r.ok||!data?.ok)throw new Error(data?.providerMessage||data?.error||`vision_http_${r.status}`);emit('result',data);return data;
    }finally{busy=false;emit('state',{active,busy:false})}
  }
  async function ask(question){return observe(`Você é o sistema de visão da Pink, assistente da Lean Performance Solutions. Responda em português do Brasil e seja objetiva. Pergunta do usuário: ${String(question||'O que você está vendo?').slice(0,3000)}. Use somente evidências visuais presentes no frame. Não faça reconhecimento biométrico nem afirme identidade de pessoas sem contexto explícito.`)}
  window.PinkVision={start,stop,observe,ask,get active(){return active},get busy(){return busy}};
})();
