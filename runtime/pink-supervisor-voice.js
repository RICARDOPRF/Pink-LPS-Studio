// Pink Supervisor Voice Runtime — low-latency STT -> Speaker -> Memory/Context -> Unified Pink Brain -> TTS.
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const MEMORY_TIMEOUT_MS=900;
  let recognition=null,active=false,speaking=false,starting=false,lastProvider='nvidia';
  const history=[];

  function providerLabel(){return lastProvider==='nvidia'?'NVIDIA Nemotron':lastProvider==='gemini'?'Gemini':lastProvider==='gemini-reasoning'?'Gemini + Google Search':lastProvider==='openai'?'OpenAI':lastProvider==='claude'?'Claude':'Pink Brain'}
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
      const recall=Promise.resolve(window.PinkMemoryCloud?.recall?.(query,{limit:6,minScore:.18})||[]);
      const memories=await Promise.race([recall,new Promise(resolve=>setTimeout(()=>resolve([]),MEMORY_TIMEOUT_MS))]);
      if(!Array.isArray(memories)||!memories.length)return '';
      return memories.map((m,i)=>`${i+1}. [${m.memory_type||m.type||'memory'}] ${m.content_text||m.text||''}`).filter(Boolean).join('\n');
    }catch(_){return ''}
  }
  function runtimeNow(){
    const d=new Date();
    return `Data e hora do dispositivo: ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeStyle:'long'}).format(d)}. Fuso: ${Intl.DateTimeFormat().resolvedOptions().timeZone||'não informado'}.`;
  }
  async function askBrain(prompt,{complex=false,memoryQuery=null}={}){
    const cfg=window.PinkPublicConfig?.supabase||{};
    if(!cfg.url||!cfg.anonKey)throw new Error('pink_brain_config_missing');
    const memoryPromise=memoryContext(memoryQuery||prompt);
    const activeProject=window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||window.PinkCore?.activeProject||null;
    const speakerContext=window.PinkSpeakerIdentity?.context?.()||'Pessoa falando: não identificada.';
    const memory=await memoryPromise;
    const input=[runtimeNow(),speakerContext,activeProject?`Projeto ativo: ${activeProject}`:'',memory?`Memórias relevantes da Pink:\n${memory}`:'',String(prompt||'')].filter(Boolean).join('\n\n');
    const endpoint=`${String(cfg.url).replace(/\/$/,'')}/functions/v1/pink-brain`;
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:`Bearer ${cfg.anonKey}`},body:JSON.stringify({input,reasoningEffort:complex?'medium':'low',maxOutputTokens:complex?1400:900})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.ok){const attempts=Array.isArray(payload?.attempts)?payload.attempts.map(x=>`${x.provider}:${x.error||x.status}`).join(' | '):'';throw new Error(payload?.message||payload?.error||attempts||`Pink Brain HTTP ${response.status}`)}
    const reply=String(payload.reply||'').trim();if(!reply)throw new Error('pink_brain_empty_output');
    lastProvider=payload.provider||'pink-brain';render();
    const speaker=window.PinkSpeakerIdentity?.current?.()||null;
    try{window.PinkMemoryCloud?.remember?.({type:'conversation',text:`Pessoa: ${speaker?.name||'não identificada'}\nPergunta: ${memoryQuery||prompt}\nResposta: ${reply}`,importance:.5,source:`pink-brain:${lastProvider}`,data:{speaker:speaker?.name||null,role:speaker?.role||null,provider:lastProvider,model:payload.model||null}}).catch(()=>{})}catch(_){}
    return {reply,provider:lastProvider,model:payload.model||null,usage:payload.usage||null,attempts:payload.attempts||[]};
  }
  function voiceScore(v){
    let score=0;const lang=String(v?.lang||''),name=String(v?.name||'');
    if(/^pt-BR$/i.test(lang))score+=100;else if(/^pt/i.test(lang))score+=60;
    if(/luciana|francisca|maria|leticia|camila|google.*portugu|microsoft.*portugu/i.test(name))score+=35;
    if(/compact|eloquence|novelty/i.test(name))score-=25;
    return score;
  }
  function browserSpeak(value){
    return new Promise(resolve=>{
      if(!window.speechSynthesis){resolve(false);return}
      window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(value);u.lang='pt-BR';u.rate=.96;u.pitch=1;u.volume=1;
      const voices=(window.speechSynthesis.getVoices?.()||[]).slice().sort((a,b)=>voiceScore(b)-voiceScore(a));u.voice=voices[0]||null;
      u.onstart=()=>state('speaking','Falando');
      u.onend=()=>resolve(true);u.onerror=()=>resolve(false);
      window.speechSynthesis.speak(u);
    });
  }
  async function speak(text){
    const value=window.PinkSpeechText?.clean?window.PinkSpeechText.clean(text,1800):String(text||'').trim().slice(0,1800);if(!value)return;
    speaking=true;try{recognition?.stop?.()}catch(_){}window.speechSynthesis?.cancel?.();state('speaking','Falando naturalmente');
    try{
      if(window.PinkNeuralTTS?.speak){
        try{await window.PinkNeuralTTS.speak(value);return}
        catch(error){window.PinkEvolution?.recordIssue?.('neural-tts-fallback',error?.message||error)}
      }
      await browserSpeak(value);
    }finally{
      speaking=false;
      if(active){state('listening');setTimeout(()=>{try{recognition?.start?.()}catch(_){}},180)}
    }
  }
  function shouldExecuteOperational(plan){
    if(!plan?.steps?.length)return false;
    if(plan.intent==='research')return true;
    return plan.steps.every(step=>step.kind==='tool');
  }
  function unwrap(value){let x=value;for(let i=0;i<5&&x&&typeof x==='object'&&x.status==='completed'&&Object.prototype.hasOwnProperty.call(x,'result');i++)x=x.result;return x}
  function verifiedReply(plan,result){
    if(!plan||result?.status!=='completed')return '';
    const first=result.results?.[0]?.result;const data=unwrap(first);
    if(plan.intent==='runtime_time'&&data){return `Agora são ${data.localTime||''}${data.localDate?`, ${data.localDate}`:''}${data.timezone?`. Fuso ${data.timezone}.`:'.'}`}
    if(plan.intent==='camera'&&data){
      if(data.observation){const o=typeof data.observation==='string'?data.observation:JSON.stringify(data.observation);return String(o).slice(0,3500)}
      if(data.message)return String(data.message);
      if(typeof data.active==='boolean')return data.active?'A câmera está aberta nesta sessão.':'A câmera está fechada.';
    }
    if(plan.intent==='research'&&data){
      const reply=String(data.reply||data.report||'').trim();if(reply){lastProvider='gemini-reasoning';render();return reply}
    }
    return '';
  }
  async function handle(text){
    const q=String(text||'').trim();if(!q)return;add('user',q);state('thinking');
    try{
      const speakerResult=await window.PinkSpeakerIdentity?.process?.(q);
      if(speakerResult?.intercept){
        const reply=String(speakerResult.response||'Quem está falando comigo?');
        add('assistant',reply);await speak(reply);return;
      }
      window.PinkCore?.handleUserSpeech?.(q);
      const operational=window.PinkIntentRouter?.plan?.(q,{activeProject:window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||null});
      let result=null;
      if(shouldExecuteOperational(operational)&&window.PinkIntentRouter?.execute){
        try{result=await window.PinkIntentRouter.execute(operational)}catch(error){window.PinkEvolution?.recordIssue?.(`operation:${operational?.intent||'unknown'}`,error?.message||error)}
      }
      if(result&&['blocked','failed'].includes(result.status))window.PinkEvolution?.recordIssue?.(`operation:${operational?.intent||'unknown'}`,JSON.stringify(result).slice(0,500));
      const direct=verifiedReply(operational,result);
      if(direct){history.push({role:'user',content:q},{role:'assistant',content:direct});while(history.length>10)history.shift();add('assistant',direct);await speak(direct);return}
      const opText=result&&result.status==='completed'?`\n\nResultado operacional verificado:\n${JSON.stringify(result).slice(0,3500)}`:result&&result.status==='needs_approval'?`\n\nAção operacional aguardando aprovação do Ricardo.`:'';
      const recent=history.slice(-4).map(x=>`${x.role}: ${x.content}`).join('\n');
      const complex=['research','knowledge','software_change','optimization'].includes(operational?.intent);
      const response=await askBrain(`${recent?`Histórico recente:\n${recent}\n\n`:''}Pergunta atual: ${q}${opText}`,{complex,memoryQuery:q});
      const reply=response.reply||'Não encontrei uma resposta disponível.';
      history.push({role:'user',content:q},{role:'assistant',content:reply});while(history.length>10)history.shift();
      try{const gatewayId=response.provider==='nvidia'?'nvidia-nemotron':response.provider;window.PinkAIGateway?.mark?.(gatewayId,'healthy',{lastUsedAt:new Date().toISOString(),model:response.model||null})}catch(_){}
      add('assistant',reply);await speak(reply);
    }catch(error){
      console.error('Pink supervisor runtime',error);window.PinkEvolution?.recordIssue?.('supervisor-runtime',error?.message||error);state('error');
      const msg='Eu ouvi sua pergunta, mas não consegui concluir essa etapa agora. Verifique a conexão e tente novamente.';add('assistant',msg);await speak(msg);if(active)state('listening');
    }
  }
  function ctor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
  async function start(){
    if(active||starting)return;starting=true;render();
    try{await window.PinkNeuralTTS?.unlock?.()}catch(_){}
    const C=ctor();if(!C){starting=false;render();state('error');add('assistant','Este navegador não oferece reconhecimento de voz. Use Chrome ou Edge.');return}
    try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});s.getTracks().forEach(t=>t.stop())}catch(e){starting=false;render();state('error');add('assistant','Libere o microfone para conversar com a Pink.');return}
    recognition=new C();recognition.lang='pt-BR';recognition.continuous=true;recognition.interimResults=false;
    recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)handle(e.results[i][0].transcript)};
    recognition.onerror=e=>{if(['aborted','no-speech'].includes(e.error))return;window.PinkEvolution?.recordIssue?.('speech-recognition',e.error)};
    recognition.onend=()=>{if(active&&!speaking)setTimeout(()=>{try{recognition.start()}catch(_){}},220)};
    try{recognition.start()}catch(_){}active=true;starting=false;render();state('listening');$('#wakeGate')?.setAttribute('hidden','');
  }
  function stop(){active=false;starting=false;speaking=false;try{recognition?.stop?.()}catch(_){}recognition=null;window.PinkNeuralTTS?.cancel?.();window.speechSynthesis?.cancel?.();render();state('idle')}
  function install(){try{window.PinkVoice?.stop?.()}catch(_){}window.PinkSupervisorVoice={start,stop,ask:handle,askBrain,get active(){return active},get voiceProvider(){return window.PinkNeuralTTS?.snapshot?.().provider||'browser-speech-synthesis'}};render();state('idle');document.addEventListener('click',e=>{const t=e.target?.closest?.('#wakePinkBtn,#callControlBtn,#geminiCallBtn');if(!t)return;e.preventDefault();e.stopImmediatePropagation();active?stop():start()},{capture:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
