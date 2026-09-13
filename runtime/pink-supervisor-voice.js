// Pink Supervisor Voice Runtime — STT -> Memory/Context -> ChatGPT Supervisor -> Gemini/NVIDIA fallback -> TTS.
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  let recognition=null,active=false,speaking=false,starting=false;
  const history=[];

  function state(name,label){
    const stage=$('#pinkStage');if(stage)stage.dataset.state=name;
    if($('#avatarStateText'))$('#avatarStateText').textContent=label||({idle:'Pronta',listening:'Ouvindo você',thinking:'Pensando',speaking:'Falando',error:'Atenção'}[name]||name);
    if($('#systemBadge'))$('#systemBadge').textContent=name==='error'?'Pink com atenção':name==='thinking'?'Pink pensando':name==='speaking'?'Pink falando':name==='listening'?'Pink ouvindo':'Pink online';
    if($('#voiceStatus'))$('#voiceStatus').textContent=name==='thinking'?'ChatGPT Supervisor · processando':name==='speaking'?'Pink · falando':name==='listening'?'Pink · ouvindo':'Pink Supervisor Voice · pronta';
  }
  function add(role,text){
    const timeline=$('#timeline'),value=String(text||'').trim();if(!timeline||!value)return;
    const item=document.createElement('div');item.className=`timeline-item ${role}`;
    item.innerHTML=`<div class="avatar-mini">${role==='assistant'?'P':'V'}</div><div class="bubble"><strong>${role==='assistant'?'Pink':'Você'}</strong><p></p><time>agora</time></div>`;
    item.querySelector('p').textContent=value;timeline.appendChild(item);timeline.scrollTop=timeline.scrollHeight;
  }
  function render(){
    const mount=$('#voiceWidgetMount');if(!mount)return;
    mount.innerHTML=`<div class="pink-call-control"><div class="call-status"><span class="call-ring"></span><div><small>PINK SUPERVISOR VOICE</small><strong>${active?'Conversa ativa':starting?'Iniciando…':'ChatGPT + memória + fallbacks'}</strong></div></div><button id="pinkSupervisorBtn" class="primary-btn" ${starting?'disabled':''}>${active?'Encerrar conversa':starting?'Iniciando…':'Falar com a Pink'}</button></div>`;
    $('#pinkSupervisorBtn')?.addEventListener('click',()=>active?stop():start());
  }
  async function geminiAsk(prompt){
    const cfg=window.PinkPublicConfig?.supabase||{},fn=cfg.functions?.geminiReasoning||'pink-gemini-reasoning';
    if(!cfg.url||!cfg.anonKey)throw new Error('gemini_reasoning_config_missing');
    const r=await fetch(`${cfg.url}/functions/v1/${fn}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:`Bearer ${cfg.anonKey}`},body:JSON.stringify({input:prompt,thinkingLevel:'high',maxOutputTokens:1800})});
    const p=await r.json().catch(()=>({}));if(!r.ok||!p?.ok)throw new Error(p?.providerMessage||p?.error||`Gemini HTTP ${r.status}`);return {reply:String(p.output||'').trim(),provider:'gemini-reasoning'};
  }
  async function askBrain(prompt){
    const errors=[];
    if(window.PinkOpenAI?.ask){try{const r=await window.PinkOpenAI.ask(prompt,{reasoningEffort:'medium',maxOutputTokens:1800});if(r?.reply)return {...r,provider:'chatgpt'}}catch(e){errors.push(`chatgpt:${e.message||e}`)}}
    try{const r=await geminiAsk(prompt);if(r.reply)return r}catch(e){errors.push(`gemini:${e.message||e}`)}
    if(window.PinkNVIDIA?.ask){try{const r=await window.PinkNVIDIA.ask(prompt,{temperature:.25,maxTokens:900});if(r?.reply)return {...r,provider:'nvidia'}}catch(e){errors.push(`nvidia:${e.message||e}`)}}
    throw new Error(errors.join(' | ')||'no_reasoning_provider_available');
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
      const reply=response.reply||'Não encontrei uma resposta disponível.';history.push({role:'user',content:q},{role:'assistant',content:reply});while(history.length>12)history.shift();add('assistant',reply);await speak(reply);
    }catch(error){
      console.error('Pink supervisor runtime',error);window.PinkEvolution?.recordIssue?.('supervisor-runtime',error?.message||error);state('error');
      const msg='Eu ouvi sua pergunta, mas nenhum dos meus cérebros de resposta está disponível agora. Verifique as integrações ChatGPT, Gemini ou NVIDIA.';add('assistant',msg);await speak(msg);if(active)state('listening');
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
  function install(){try{window.PinkVoice?.stop?.()}catch(_){}window.PinkSupervisorVoice={start,stop,ask:handle,get active(){return active}};render();state('idle');
    document.addEventListener('click',e=>{const t=e.target?.closest?.('#wakePinkBtn,#callControlBtn,#geminiCallBtn');if(!t)return;e.preventDefault();e.stopImmediatePropagation();active?stop():start()},{capture:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
