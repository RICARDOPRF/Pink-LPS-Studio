// Pink Gemini Live — direct browser audio with short-lived Supabase-brokered token.
(() => {
  'use strict';
  const cfg=window.PinkPublicConfig||{};
  const supabase=cfg.supabase||{};
  const TOKEN_FN=supabase.functions?.geminiToken||'pink-gemini-token';
  const WS_BASE='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
  const $=s=>document.querySelector(s);
  let ws=null,micStream=null,inputCtx=null,inputSource=null,processor=null,outputCtx=null,nextPlayTime=0,active=false,starting=false,setupReady=false,inputTranscript='',outputTranscript='';

  function setState(state,label){
    const stage=$('#pinkStage');if(stage)stage.dataset.state=state;
    const stateText=$('#avatarStateText');if(stateText)stateText.textContent=label||({idle:'Pronta',listening:'Ouvindo você',thinking:'Pensando',speaking:'Falando',error:'Atenção'}[state]||state);
    const status=$('#voiceStatus');if(status)status.textContent=state==='error'?'Gemini Live indisponível':state==='speaking'?'Gemini Live · Pink falando':state==='listening'?'Gemini Live · ouvindo':'Gemini Live · conectado';
    const badge=$('#systemBadge');if(badge)badge.textContent=state==='error'?'Verificar Gemini Live':'Pink online';
    window.PinkEvolution?.recordState?.(state);
  }
  function add(role,text){
    const value=String(text||'').trim(),timeline=$('#timeline');if(!value||!timeline)return;
    const item=document.createElement('div');item.className=`timeline-item ${role}`;
    item.innerHTML=`<div class="avatar-mini">${role==='assistant'?'P':'V'}</div><div class="bubble"><strong>${role==='assistant'?'Pink':'Você'}</strong><p></p><time>agora</time></div>`;
    item.querySelector('p').textContent=value;timeline.appendChild(item);timeline.scrollTop=timeline.scrollHeight;
  }
  function render(){
    const mount=$('#voiceWidgetMount');if(!mount)return;
    mount.innerHTML=`<div class="pink-call-control"><div class="call-status"><span class="call-ring"></span><div><small>GEMINI LIVE · NATIVE AUDIO</small><strong id="callControlText">${active?'Conversa em andamento':starting?'Conectando ao Gemini Live…':'Pink pronta para falar'}</strong></div></div><button id="geminiCallBtn" class="primary-btn" ${starting?'disabled':''}>${active?'Encerrar conversa':starting?'Conectando…':'Falar com a Pink'}</button></div>`;
    $('#geminiCallBtn')?.addEventListener('click',()=>active?stop():start());
  }
  async function token(){
    if(!supabase.url||!supabase.anonKey)throw new Error('Supabase public config missing');
    const r=await fetch(`${supabase.url}/functions/v1/${TOKEN_FN}`,{method:'POST',headers:{apikey:supabase.anonKey,Authorization:`Bearer ${supabase.anonKey}`,'Content-Type':'application/json'},body:'{}'});
    const data=await r.json().catch(()=>({}));if(!r.ok||!data?.token)throw new Error(data?.providerMessage||data?.error||`Gemini token HTTP ${r.status}`);return data;
  }
  function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s)}
  function fromB64(s){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
  function pcm16(float32,inputRate,targetRate=16000){
    const ratio=inputRate/targetRate,n=Math.max(1,Math.floor(float32.length/ratio)),out=new Int16Array(n);
    for(let i=0;i<n;i++){const start=Math.floor(i*ratio),end=Math.min(float32.length,Math.floor((i+1)*ratio));let sum=0,count=0;for(let j=start;j<end;j++){sum+=float32[j];count++}const v=Math.max(-1,Math.min(1,sum/Math.max(1,count)));out[i]=v<0?v*32768:v*32767}return new Uint8Array(out.buffer);
  }
  async function startMic(){
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    const Ctx=window.AudioContext||window.webkitAudioContext;inputCtx=new Ctx();if(inputCtx.state==='suspended')await inputCtx.resume();
    inputSource=inputCtx.createMediaStreamSource(micStream);processor=inputCtx.createScriptProcessor(2048,1,1);const silent=inputCtx.createGain();silent.gain.value=0;
    processor.onaudioprocess=e=>{if(!active||!setupReady||ws?.readyState!==WebSocket.OPEN)return;const bytes=pcm16(e.inputBuffer.getChannelData(0),inputCtx.sampleRate);ws.send(JSON.stringify({realtimeInput:{mediaChunks:[{mimeType:'audio/pcm;rate=16000',data:b64(bytes)}]}}))};
    inputSource.connect(processor);processor.connect(silent);silent.connect(inputCtx.destination);
  }
  async function playPcm(data,rate=24000){
    const Ctx=window.AudioContext||window.webkitAudioContext;outputCtx=outputCtx||new Ctx({sampleRate:rate});if(outputCtx.state==='suspended')await outputCtx.resume();
    const bytes=fromB64(data),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),samples=new Float32Array(Math.floor(bytes.byteLength/2));for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
    const buffer=outputCtx.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);const src=outputCtx.createBufferSource();src.buffer=buffer;src.connect(outputCtx.destination);const now=outputCtx.currentTime;nextPlayTime=Math.max(now+.015,nextPlayTime);src.start(nextPlayTime);nextPlayTime+=buffer.duration;setState('speaking');src.onended=()=>{if(active&&outputCtx.currentTime>=nextPlayTime-.03)setState('listening')};
    window.dispatchEvent(new CustomEvent('pinkvoice:audio',{detail:{provider:'gemini-live',pcm16:bytes,sampleRate:rate}}));
  }
  function server(msg){
    if(msg.setupComplete){setupReady=true;setState('listening');startMic().catch(fail);return}
    const sc=msg.serverContent||{};
    const it=sc.inputTranscription?.text;if(it){inputTranscript+=it;if(sc.turnComplete&&inputTranscript.trim()){add('user',inputTranscript);try{window.PinkCore?.handleUserSpeech?.(inputTranscript)}catch(_){}inputTranscript=''}}
    const ot=sc.outputTranscription?.text;if(ot)outputTranscript+=ot;
    const parts=sc.modelTurn?.parts||[];for(const p of parts){const inline=p.inlineData||p.inline_data;if(inline?.data&&String(inline.mimeType||inline.mime_type||'').startsWith('audio/'))playPcm(inline.data,Number((inline.mimeType||inline.mime_type||'').match(/rate=(\d+)/)?.[1]||24000)).catch(fail)}
    if(sc.interrupted){try{outputCtx?.close?.()}catch(_){}outputCtx=null;nextPlayTime=0;setState('listening')}
    if(sc.turnComplete){if(outputTranscript.trim())add('assistant',outputTranscript);outputTranscript='';if(active)setState('listening')}
  }
  function fail(error){console.error('Pink Gemini Live',error);window.PinkEvolution?.recordIssue?.('gemini-live',error?.message||error);setState('error');stop(false);showGate('Não consegui conectar ao Gemini Live. Verifique a API/billing e tente novamente.');}
  function showGate(text){const gate=$('#wakeGate');if(!gate)return;gate.hidden=false;const t=$('#wakeTitle'),p=$('#wakeText'),b=$('#wakePinkBtn');if(t)t.textContent='Gemini Live indisponível';if(p)p.textContent=text;if(b){b.disabled=false;b.textContent='Tentar novamente'}}
  async function start(){
    if(active||starting)return true;starting=true;render();setState('thinking','Conectando…');
    try{
      const data=await token();const endpoint=`${WS_BASE}?access_token=${encodeURIComponent(data.token)}`;ws=new WebSocket(endpoint);
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Gemini Live WebSocket timeout')),10000);ws.onopen=()=>{clearTimeout(timer);resolve()};ws.onerror=()=>{clearTimeout(timer);reject(new Error('Gemini Live WebSocket error'))}});
      ws.onmessage=e=>{try{server(JSON.parse(e.data))}catch(err){console.warn('Gemini Live message parse',err)}};ws.onclose=e=>{if(active&&e.code!==1000)fail(new Error(`Gemini Live closed ${e.code} ${e.reason||''}`))};
      const setup={model:data.model,generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Aoede'}}}},systemInstruction:{parts:[{text:data.systemInstruction||'Você é Pink, assistente da Lean Performance Solutions. Responda em português do Brasil.'}]},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:false,prefixPaddingMs:40,silenceDurationMs:450}}};
      ws.send(JSON.stringify({setup}));active=true;starting=false;render();$('#wakeGate')?.setAttribute('hidden','');window.PinkEvolution?.recordSession?.('gemini-live-connected');return true;
    }catch(e){starting=false;render();fail(e);return false}
  }
  function stop(normal=true){active=false;starting=false;setupReady=false;try{processor?.disconnect()}catch(_){}try{inputSource?.disconnect()}catch(_){}micStream?.getTracks?.().forEach(t=>t.stop());try{inputCtx?.close?.()}catch(_){}try{outputCtx?.close?.()}catch(_){}try{if(ws?.readyState===WebSocket.OPEN)ws.close(1000,'user-stop')}catch(_){}ws=null;micStream=null;inputCtx=null;outputCtx=null;nextPlayTime=0;if(normal)setState('idle');render();}
  function install(){
    try{window.PinkVoice?.stop?.()}catch(_){}
    window.PinkVoice={provider:'gemini-live',start,stop,getConversation:()=>null,get mode(){return active?'gemini-live':'idle'},get variableVoiceCost(){return 'gemini-api-usage'}};
    document.addEventListener('click',e=>{const target=e.target?.closest?.('#callControlBtn,#voiceProviderToggle,#wakePinkBtn');if(!target)return;e.preventDefault();e.stopImmediatePropagation();active?stop():start();},{capture:true});
    render();const status=$('#voiceStatus');if(status)status.textContent='Gemini Live · pronto';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
