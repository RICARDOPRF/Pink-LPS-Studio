// Pink Gemini Voice Bridge — speech-only output for ChatGPT Supervisor responses.
(() => {
  'use strict';
  const WS_BASE='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
  const cfg=()=>window.PinkPublicConfig?.supabase||{};
  let session=null;

  function endpoint(){const c=cfg();return `${String(c.url||'').replace(/\/$/,'')}/functions/v1/${c.functions?.geminiToken||'pink-gemini-token'}`}
  function headers(){const c=cfg();return {'Content-Type':'application/json',apikey:c.anonKey,Authorization:`Bearer ${c.anonKey}`}}
  function fromB64(value){const raw=atob(value),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}

  async function token(){
    const c=cfg();if(!c.url||!c.anonKey)throw new Error('gemini_voice_config_missing');
    const response=await fetch(endpoint(),{method:'POST',headers:headers(),body:'{}'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.token)throw new Error(data?.providerMessage||data?.error||`Gemini token HTTP ${response.status}`);
    return data;
  }

  function stop(){
    const current=session;session=null;if(!current)return;
    current.cancelled=true;
    try{if(current.ws?.readyState===WebSocket.OPEN)current.ws.close(1000,'voice-stop')}catch(_){}
    try{current.outputCtx?.close?.()}catch(_){}
  }

  async function speak(text,options={}){
    const value=String(text||'').trim();if(!value)return {ok:true,provider:'gemini-live',empty:true};
    stop();
    const data=await token();
    const voiceName=String(options.voiceName||window.PinkPublicConfig?.voice?.voiceName||'Aoede');
    const ws=new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(data.token)}`);
    const current={ws,outputCtx:null,nextPlayTime:0,cancelled:false,receivedAudio:false,turnComplete:false};session=current;

    const opened=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('gemini_voice_ws_timeout')),10000);
      ws.onopen=()=>{clearTimeout(timer);resolve()};
      ws.onerror=()=>{clearTimeout(timer);reject(new Error('gemini_voice_ws_error'))};
    });
    await opened;

    let doneResolve,doneReject;
    const done=new Promise((resolve,reject)=>{doneResolve=resolve;doneReject=reject});
    const Ctx=window.AudioContext||window.webkitAudioContext;

    async function playPcm(encoded,rate=24000){
      if(current.cancelled)return;
      if(!Ctx)throw new Error('web_audio_unavailable');
      const bytes=fromB64(encoded),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),samples=new Float32Array(Math.floor(bytes.byteLength/2));
      for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
      current.outputCtx=current.outputCtx||new Ctx({sampleRate:rate});
      if(current.outputCtx.state==='suspended')await current.outputCtx.resume();
      const buffer=current.outputCtx.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);
      const src=current.outputCtx.createBufferSource();src.buffer=buffer;src.connect(current.outputCtx.destination);
      const now=current.outputCtx.currentTime;current.nextPlayTime=Math.max(now+.01,current.nextPlayTime);src.start(current.nextPlayTime);current.nextPlayTime+=buffer.duration;current.receivedAudio=true;
      window.dispatchEvent(new CustomEvent('pinkvoice:audio',{detail:{provider:'gemini-live',mode:'speech-only',pcm16:bytes,sampleRate:rate}}));
    }

    function finish(){
      if(current.cancelled)return;
      const remaining=current.outputCtx?Math.max(0,current.nextPlayTime-current.outputCtx.currentTime):0;
      setTimeout(()=>{
        if(current.cancelled)return;
        try{if(ws.readyState===WebSocket.OPEN)ws.close(1000,'voice-complete')}catch(_){}
        try{current.outputCtx?.close?.()}catch(_){}
        if(session===current)session=null;
        if(current.receivedAudio)doneResolve({ok:true,provider:'gemini-live',voiceName});
        else doneReject(new Error('gemini_voice_empty_audio'));
      },remaining*1000+80);
    }

    ws.onmessage=event=>{
      try{
        const message=JSON.parse(event.data);
        if(message.setupComplete){
          const request=`Sua unica tarefa e vocalizar literalmente o texto dentro de <speak>, em portugues do Brasil. Nao responda, nao explique, nao resuma e nao altere nenhuma palavra. <speak>${value}</speak>`;
          ws.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:request}]}],turnComplete:true}}));
          return;
        }
        const content=message.serverContent||{};
        const parts=content.modelTurn?.parts||[];
        for(const part of parts){
          const inline=part.inlineData||part.inline_data;
          if(inline?.data&&String(inline.mimeType||inline.mime_type||'').startsWith('audio/')){
            const mime=String(inline.mimeType||inline.mime_type||'');const rate=Number(mime.match(/rate=(\d+)/)?.[1]||24000);
            playPcm(inline.data,rate).catch(doneReject);
          }
        }
        if(content.turnComplete&&!current.turnComplete){current.turnComplete=true;finish()}
      }catch(error){doneReject(error)}
    };
    ws.onclose=event=>{if(!current.cancelled&&!current.turnComplete&&event.code!==1000)doneReject(new Error(`gemini_voice_closed_${event.code}`))};
    ws.onerror=()=>{if(!current.cancelled)doneReject(new Error('gemini_voice_ws_error'))};

    const setup={
      model:data.model||window.PinkPublicConfig?.voice?.model||'models/gemini-3.1-flash-live-preview',
      generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}},
      systemInstruction:{parts:[{text:'Voce e somente a camada de voz da Pink. O raciocinio e o conteudo da resposta ja foram produzidos pelo ChatGPT Supervisor. Vocalize literalmente o texto recebido, sem acrescentar conteudo.'}]}
    };
    ws.send(JSON.stringify({setup}));
    try{return await done}catch(error){stop();throw error}
  }

  window.PinkGeminiVoice={version:'1.0.0',provider:'gemini-live',role:'speech-only',speak,stop,get active(){return Boolean(session&&!session.cancelled)}};
  window.dispatchEvent(new CustomEvent('pinkgeminivoice:ready'));
})();
