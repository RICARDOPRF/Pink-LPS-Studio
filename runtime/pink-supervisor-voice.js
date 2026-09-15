// Pink Supervisor Voice Runtime — STT -> Memory/Context -> Unified Pink Brain -> TTS.
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  let recognition=null,active=false,speaking=false,starting=false,lastProvider='nvidia';
  const history=[];

  function providerLabel(){
    return lastProvider==='nvidia'?'NVIDIA Nemotron':lastProvider==='gemini'?'Gemini':lastProvider==='openai'?'OpenAI':lastProvider==='claude'?'Claude':'Pink Brain';
  }

  function state(name,label){
    const stage=$('#pinkStage');if(stage)stage.dataset.state=name;
    if($('#avatarStateText'))$('#avatarStateText').textContent=label||({idle:'Pronta',listening:'Ouvindo você',thinking:'Pensando',speaking:'Falando',error:'Atenção'}[name]||name);
    if($('#systemBadge'))$('#systemBadge').textContent=name==='error'?'Pink com atenção':name==='thinking'?'Pink pensando':name==='speaking'?'Pink falando':name==='listening'?'Pink ouvindo':'Pink online';
    if($('#voiceStatus'))$('#voiceStatus').textContent=name==='thinking'?`${providerLabel()} · processando`:name==='speaking'?`Pink · falando via ${providerLabel()}`:name==='listening'?'Pink · ouvindo':`Pink Supervisor Voice · ${providerLabel()} pronta`;
  }

  function add(role,text){
    const timeline=$('#timeline'),value=String(text||'').trim();if(!timeline||!value)return;
    const item=document.createElement('div');item.className=`timeline-item ${role}`;
    item.innerHTML=`<div class="avatar-mini">${role==='assistant'?'P':'V'}</div><div class="bubble"><strong>${role==='assistant'?'Pink':'Você'}</strong><p></p><time>agora</time></div>`;
    item.querySelector('p').textContent=value;timeline.appendChild(item);timeline.scrollTop=timeline.scrollHeight;
  }

  function render(){
    const mount=$('#voiceWidgetMount');if(!mount)return;
    mount.innerHTML=`<div class="pink-call-control"><div class="call-status"><span class="call-ring"></span><div><small>PINK SUPERVISOR VOICE</small><strong>${active?'Conversa ativa':starting?'Iniciando…':`${providerLabel()} principal · Gemini fallback`}</strong></div></div><button id="pinkSupervisorBtn" class="primary-btn" ${starting?'disabled':''}>${active?'Encerrar conversa':starting?'Iniciando…':'Falar com a Pink'}</button></div>`;
    $('#pinkSupervisorBtn')?.addEventListener('click',()=>active?stop():start());
  }

  async function memoryContext(query){
    try{
      const memories=await window.PinkMemoryCloud?.recall?.(query,{limit:8,minScore:.18})||[];
      if(!memories.length)return '';
      return memories.map((m,i)=>`${i+1}. [${m.memory_type||m.type||'memory'}] ${m.content_text||m.text||''}`).filter(Boolean).join('\n');
    }catch(_){return ''}
  }

  async function askBrain(prompt){
    const cfg=window.PinkPublicConfig?.supabase||{};
    if(!cfg.url||!cfg.anonKey)throw new Error('pink_brain_config_missing');
    const memory=await memoryContext(prompt);
    const activeProject=window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||window.PinkCore?.activeProject||null;
    const input=[activeProject?`Projeto ativo: ${activeProject}`:'',memory?`Memórias relevantes da Pink:\n${memory}`:'',String(prompt||'')].filter(Boolean).join('\n\n');
    const endpoint=`${String(cfg.url).replace(/\/$/,'')}/functions/v1/pink-brain`;
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:`Bearer ${cfg.anonKey}`},body:JSON.stringify({input,reasoningEffort:'medium',thinkingLevel:'high',maxOutputTokens:1800})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.ok){
      const attempts=Array.isArray(payload?.attempts)?payload.attempts.map(x=>`${x.provider}:${x.error||x.status}`).join(' | '):'';
      throw new Error(payload?.message||payload?.error||attempts||`Pink Brain HTTP ${response.status}`);
    }
    const reply=String(payload.reply||'').trim();
    if(!reply)throw new Error('pink_brain_empty_output');
    lastProvider=payload.provider||'pink-brain';
    render();
    try{window.PinkMemoryCloud?.remember?.({type:'conversation',text:`Pergunta: ${prompt}\nResposta: ${reply}`,importance:.35,source:`pink-brain:${lastProvider}`}).catch(()=>{})}catch(_){ }
    return {reply,provider:lastProvider,model:payload.model||null,usage:payload.usage||null,attempts:payload.attempts||[]};
  }

  function speak(text){
    return new Promise(resolve=>{
      const value=String(text||'').trim();if(!value){resolve();return}
      if(!window.speechSynthesis){resolve();return}
      speaking=true;try{recognition?.stop?.()}catch(_){}window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(value);u.lang='pt-BR';u.rate=.98;u.pitch=1.02;
      const voices=window.speechSynthesis.getVoices?.()||[];u.voice=voices.find(v=>/^pt-BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang))||null;
      u.onstart=()=>state('speaking');u.onend=u.onerror=()=>{speaking=false;if(active){state('listening');setTimeout(()=>{try{recognition?.start?.()}catch(_){}},250)}resolve()};window.speechSynthesis.speak(u);
    });
  }

  async function handle(text){
    const q=String(text||'').trim();if(!q)return;add('user',q);state('thinking');
    try{
      window.PinkCore?.handleUserSpeech?.(q);
      const operational=window.PinkIntentRouter?.plan?.(q,{activeProject:window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||null});
      let result=null;
      if(operational&&window.PinkIntentRouter?.execute){try{result=await window.PinkIntentRouter.execute(operational)}catch(_){} }
      const opText=result&&result.status==='completed'?`\n\nResultado operacional verificado:\n${JSON.stringify(result).slice(0,5000)}`:'';
      const recent=history.slice(-6).map(x=>`${x.role}: ${x.content}`).join('\n');
      const response=await askBrain(`${recent?`Histórico recente:\n${recent}\n\n`:''}Pergunta atual: ${q}${opText}`);
      const reply=response.reply||'Não encontrei uma resposta disponível.';
      history.push({role:'user',content:q},{role:'assistant',content:reply});while(history.length>12)history.shift();
      try{
        const gatewayId=response.provider==='nvidia'?'nvidia-nemotron':response.provider;
        window.PinkAIGateway?.mark?.(gatewayId,'healthy',{lastUsedAt:new Date().toISOString(),model:response.model||null});
      }catch(_){}
      add('assistant',reply);await speak(reply);
    }catch(error){
      console.error('Pink supervisor runtime',error);window.PinkEvolution?.recordIssue?.('supervisor-runtime',error?.message||error);state('error');
      const msg='Eu ouvi sua pergunta, mas o Pink Brain não conseguiu obter resposta de nenhum provedor configurado no Supabase. Verifique a conexão e tente novamente.';
      add('assistant',msg);await speak(msg);if(active)state('listening');
    }
  }

  function ctor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
  async function start(){
    if(active||starting)return;starting=true;render();
    const C=ctor();if(!C){starting=false;render();state('error');add('assistant','Este navegador não oferece reconhecimento de voz. Use Chrome ou Edge.');return}
    try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});s.getTracks().forEach(t=>t.stop())}catch(e){starting=false;render();state('error');add('assistant','Libere o microfone para conversar com a Pink.');return}
    recognition=new C();recognition.lang='pt-BR';recognition.continuous=true;recognition.interimResults=false;
    recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)handle(e.results[i][0].transcript)};
    recognition.onerror=e=>{if(['aborted','no-speech'].includes(e.error))return;window.PinkEvolution?.recordIssue?.('speech-recognition',e.error)};
    recognition.onend=()=>{if(active&&!speaking)setTimeout(()=>{try{recognition.start()}catch(_){}},300)};
    try{recognition.start()}catch(_){}active=true;starting=false;render();state('listening');$('#wakeGate')?.setAttribute('hidden','');
  }

  function stop(){active=false;starting=false;speaking=false;try{recognition?.stop?.()}catch(_){}recognition=null;window.speechSynthesis?.cancel?.();render();state('idle')}
  function install(){try{window.PinkVoice?.stop?.()}catch(_){}window.PinkSupervisorVoice={start,stop,ask:handle,askBrain,get active(){return active}};render();state('idle');
    document.addEventListener('click',e=>{const t=e.target?.closest?.('#wakePinkBtn,#callControlBtn,#geminiCallBtn');if(!t)return;e.preventDefault();e.stopImmediatePropagation();active?stop():start()},{capture:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();