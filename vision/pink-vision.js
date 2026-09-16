// Pink Vision — explicit opt-in camera, persistent session stream, on-demand server-side analysis.
(() => {
  'use strict';
  const cfg=window.PinkPublicConfig?.supabase||{};
  const FN=cfg.functions?.vision||'pink-vision';
  let stream=null,video=null,canvas=null,host=null,active=false,busy=false;
  function ensure(){
    if(video&&canvas&&host)return;
    host=document.createElement('div');host.id='pinkVisionRuntime';host.hidden=true;
    host.style.cssText='position:fixed;right:18px;bottom:18px;width:min(320px,42vw);z-index:9998;border-radius:16px;overflow:hidden;background:#02060c;box-shadow:0 16px 48px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.15);font:600 12px Inter,sans-serif;color:#fff';
    host.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(2,6,12,.9)"><span>● Pink Vision · câmera ativa</span><button id="pinkVisionClose" type="button" aria-label="Fechar câmera" style="border:0;border-radius:8px;padding:5px 8px;background:#1d2735;color:#fff;cursor:pointer">Fechar</button></div><video id="pinkVisionCamera" autoplay playsinline muted style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000"></video><div style="padding:7px 10px;color:#aeb8c6;font-weight:500">Stream local ativo · frames só são enviados quando você pedir análise.</div><canvas id="pinkVisionCanvas" hidden></canvas>';
    document.body.appendChild(host);video=host.querySelector('video');canvas=host.querySelector('canvas');host.querySelector('#pinkVisionClose')?.addEventListener('click',()=>stop());
  }
  function emit(type,detail={}){window.dispatchEvent(new CustomEvent(`pinkvision:${type}`,{detail}))}
  function show(){ensure();if(host)host.hidden=false}
  function hide(){if(host)host.hidden=true}
  async function start(){
    ensure();if(active){show();return true}
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera_api_unavailable');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
    for(const track of stream.getVideoTracks?.()||[]){track.addEventListener?.('ended',()=>{if(active){stream=null;if(video)video.srcObject=null;active=false;hide();emit('state',{active:false,reason:'track-ended'})}},{once:true})}
    video.srcObject=stream;await video.play();active=true;show();emit('state',{active:true});return true;
  }
  function stop(){stream?.getTracks?.().forEach(t=>t.stop());stream=null;if(video)video.srcObject=null;active=false;busy=false;hide();emit('state',{active:false,reason:'user-stop'})}
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
  window.PinkVision={start,stop,observe,ask,get stream(){return stream},get active(){return active},get busy(){return busy}};
})();
