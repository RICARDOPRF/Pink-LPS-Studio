// Pink Supervisor Voice Runtime — STT -> Memory/Context -> ChatGPT Supervisor -> Gemini Voice.
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  let recognition=null,active=false,speaking=false,starting=false;
  const history=[];

  function state(name,label){
    const stage=$('#pinkStage');if(stage)stage.dataset.state=name;
    if($('#avatarStateText'))$('#avatarStateText').textContent=label||({idle:'Pronta',listening:'Ouvindo você',thinking:'Pensando',speaking:'Falando',error:'Atenção'}[name]||name);
    if($('#systemBadge'))$('#systemBadge').textContent=name==='error'?'Pink com atenção':name==='thinking'?'ChatGPT pensando':name==='speaking'?'Pink falando':name==='listening'?'Pink ouvindo':'Pink online';
    if($('#voiceStatus'))$('#voiceStatus').textContent=name==='thinking'?'ChatGPT Supervisor · processando':name==='speaking'?'Gemini Voice · falando':name==='listening'?'Pink · ouvindo':'ChatGPT + Gemini Voice · pronta';
  }

  function add(role,text){
    const timeline=$('#timeline'),value=String(text||'').trim();if(!timeline||!value)return;
    const item=document.createElement('div');item.className=`timeline-item ${role}`;
    item.innerHTML=`<div class="avatar-mini">${role==='assistant'?'P':'V'}</div><div class="bubble"><strong>${role==='assistant'?'Pink':'Você'}</strong><p></p><time>agora</time></div>`;
    item.querySelector('p').textContent=value;timeline.appendChild(item);timeline.scrollTop=timeline.scrollHeight;
  }

  function render(){
    const mount=$('#voiceWidgetMount');if(!mount)return;
    mount.innerHTML=`<div class="pink-call-control"><div class="call-status"><span class="call-ring"></span><div><small>CHATGPT BRAIN · GEMINI VOICE</small><strong>${active?'Conversa ativa':starting?'Iniciando…':'ChatGPT pensa · Gemini fala'}</strong></div></div><button id="pinkSupervisorBtn" class="primary-btn" ${starting?'disabled':''}>${active?'Encerrar conversa':starting?'Iniciando…':'Falar com a Pink'}</button></div>`;
    $('#pinkSupervisorBtn')?.addEventListener('click',()=>active?stop():start());
  }

  async function memoryContext(query){
    try{
      const memories=await window.PinkMemoryCloud?.recall?.(query,{limit:8,minScore:.18})||[];
      if(!memories.length)return '';
      return memories.map((m,i)=>`${i+1}. [${m.memory_type||m.type||'memory'}] ${m.content_text||m.text||''}`).filter(Boolean).join('\n');
    }catch(_){return ''}
  }

  async function askChatGPT(prompt){
    if(!window.PinkOpenAI?.ask)throw new Error('chatgpt_bridge_unavailable');
    const memory=await memoryContext(prompt);
    const activeProject=window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||window.PinkCore?.activeProject||null;
    const input=[
      activeProject?`Projeto ativo: ${activeProject}`:'',
      memory?`Memórias relevantes da Pink:\n${memory}`:'',
      String(prompt||'')
    ].filter(Boolean).join('\n\n');
    const result=await window.PinkOpenAI.ask(input,{useMemory:false,reasoningEffort:'medium',maxOutputTokens:1800});
    const reply=String(result?.reply||'').trim();
    if(!reply)throw new Error('chatgpt_empty_output');
    return {reply,provider:'chatgpt',model:result.model||null,usage:result.usage||null};
  }

  async function askFallback(prompt,primaryError){
    const cfg=window.PinkPublicConfig?.supabase||{};
    if(!cfg.url||!cfg.anonKey)throw primaryError;
    const endpoint=`${String(cfg.url).replace(/\/$/,'')}/functions/v1/${cfg.functions?.brain||'pink-brain'}`;
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:`Bearer ${cfg.anonKey}`},body:JSON.stringify({input:String(prompt||''),skipProviders:['openai'],reasoningEffort:'medium',thinkingLevel:'high',maxOutputTokens:1800})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.ok)throw primaryError;
    const reply=String(payload.reply||'').trim();if(!reply)throw primaryError;
    return {reply,provider:payload.provider||'fallback',model:payload.model||null,usage:payload.usage||null};
  }

  async function askBrain(prompt){
    try{return await askChatGPT(prompt)}catch(error){
      window.PinkEvolution?.recordIssue?.('chatgpt-supervisor',error?.message||error);
      return askFallback(prompt,error);
    }
  }

  function browserSpeak(text){
    return new Promise(resolve=>{
      const value=String(text||'').trim();if(!value||!window.speechSynthesis){resolve();return}
      window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(value);u.lang='pt-BR';u.rate=.98;u.pitch=1.02;
      const voices=window.speechSynthesis.getVoices?.()||[];u.voice=voices.find(v=>/^pt-BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang))||null;
      u.onstart=()=>state('speaking');u.onend=u.onerror=()=>resolve();window.speechSynthesis.speak(u);
    });
  }

  async function speak(text){
    const value=String(text||'').trim();if(!value)return;
    speaking=true;try{recognition?.stop?.()}catch(_){}window.speechSynthesis?.cancel?.();state('speaking');
    try{
      if(!window.PinkGeminiVoice?.speak)throw new Error('gemini_voice_bridge_unavailable');
      await window.PinkGeminiVoice.speak(value,{voiceName:window.PinkPublicConfig?.voice?.voiceName||'Aoede'});
    }catch(error){
      window.PinkEvolution?.recordIssue?.('gemini-voice',error?.message||error);
      await browserSpeak(value);
    }finally{
      speaking=false;
      if(active){state('listening');setTimeout(()=>{try{recognition?.start?.()}catch(_){}},250)}
    }
  }

  async function handle(text){
    const q=String(text||'').trim();if(!q)return;add('user',q);state('thinking');
    try{
      window.PinkCore?.handleUserSpeech?.(q);
      const operational=window.PinkIntentRouter?.plan?.(q,{activeProject:window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||null});
      let result=null;if(operational&&window.PinkIntentRouter?.execute){try{result=await window.PinkIntentRouter.execute(operational)}catch(_){} }
      const opText=result&&result.status==='completed'?`\n\nResultado operacional verificado:\n${JSON.stringify(result).slice(0,5000)}`:'';
      const recent=history.slice(-6).map(x=>`${x.role}: ${x.content}`).join('\n');
      const response=await askBrain(`${recent?`Histórico recente:\n${recent}\n\n`:''}Pergunta atual: ${q}${opText}`);
      const reply=response.reply||'Não encontrei uma resposta disponível.';
      history.push({role:'user',content:q},{role:'assistant',content:reply});while(history.length>12)history.shift();
      try{window.PinkAIGateway?.mark?.('chatgpt',response.provider==='chatgpt'?'healthy':'degraded',{lastUsedAt:new Date().toISOString()})}catch(_){}
      add('assistant',reply);await speak(reply);
    }catch(error){
      console.error('Pink supervisor runtime',error);window.PinkEvolution?.recordIssue?.('supervisor-runtime',error?.message||error);state('error');
      const detail=String(error?.message||error||'').slice(0,180);
      const msg=`Eu ouvi sua pergunta, mas o ChatGPT Supervisor não respondeu agora${detail?` (${detail})`:''}.`;
      add('assistant',msg);await speak(msg);if(active)state('listening');
    }
  }

  function ctor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
  async function start(){
    if(active||starting)return true;starting=true;render();
    const C=ctor();if(!C){starting=false;render();state('error');add('assistant','Este navegador não oferece reconhecimento de voz. Use Chrome ou Edge.');return false}
    try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});s.getTracks().forEach(t=>t.stop())}catch(e){starting=false;render();state('error');add('assistant','Libere o microfone para conversar com a Pink.');return false}
    recognition=new C();recognition.lang='pt-BR';recognition.continuous=true;recognition.interimResults=false;
    recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)handle(e.results[i][0].transcript)};
    recognition.onerror=e=>{if(['aborted','no-speech'].includes(e.error))return;window.PinkEvolution?.recordIssue?.('speech-recognition',e.error)};
    recognition.onend=()=>{if(active&&!speaking)setTimeout(()=>{try{recognition.start()}catch(_){}},300)};
    try{recognition.start()}catch(_){}active=true;starting=false;render();state('listening');$('#wakeGate')?.setAttribute('hidden','');return true;
  }

  function stop(){active=false;starting=false;speaking=false;try{recognition?.stop?.()}catch(_){}recognition=null;window.PinkGeminiVoice?.stop?.();window.speechSynthesis?.cancel?.();render();state('idle')}
  function install(){try{window.PinkVoice?.stop?.()}catch(_){}window.PinkSupervisorVoice={start,stop,ask:handle,askBrain,askChatGPT,get active(){return active}};render();state('idle');
    document.addEventListener('click',e=>{const t=e.target?.closest?.('#wakePinkBtn,#callControlBtn,#geminiCallBtn');if(!t)return;e.preventDefault();e.stopImmediatePropagation();active?stop():start()},{capture:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
