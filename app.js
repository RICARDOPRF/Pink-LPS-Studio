const ELEVENLABS_AGENT_ID = 'agent_0001m2brk3bxes2vwzc26rpzqww4';
const ELEVENLABS_BRANCH_ID = 'agtbrch_2101m2brk4sremv9s75zgjgt61q4';
const ELEVENLABS_CLIENT_CDN = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm';
const $ = (sel) => document.querySelector(sel);
const timeline = $('#timeline');
const settingsDialog = $('#settingsDialog');
let callActive = false;
let lastStateBeforeError = 'idle';
let stateFallbackTimer = null;
let conversation = null;
let elevenLabsSdkPromise = null;
let autoStartAttempted = false;
let startingCall = false;
let fallbackVoiceActive = false;
let fallbackStarting = false;
let fallbackRecognition = null;
let fallbackSpeaking = false;
let fallbackRestartTimer = null;
let fallbackContextBuffer = [];
let fallbackHistory = [];
let fallbackTurnSerial = 0;
let fallbackInternalPending = false;
let elevenConnectedAt = 0;
let elevenMessageCount = 0;
let lastStartUserGesture = false;
const seenMessages = new Set();

const STATE = {
  idle:{label:'Pronta',badge:'Pink online',voice:'ElevenLabs pronto · Roberta',node:null},
  listening:{label:'Ouvindo você',badge:'Pink ouvindo',voice:'Ouvindo…',node:'listen'},
  thinking:{label:'Pensando',badge:'Pink pensando',voice:'Processando pedido…',node:'think'},
  speaking:{label:'Falando',badge:'Pink falando',voice:'Roberta · ElevenLabs',node:'speak'},
  executing:{label:'Executando',badge:'Pink executando',voice:'Executando ação…',node:'act'},
  error:{label:'Atenção',badge:'Verificar voz',voice:'Falha na conexão',node:null}
};

function nowLabel(){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}
function addMessage(role,text){
  if(!text||!timeline)return;
  const cleaned=String(text).trim();
  if(!cleaned)return;
  const key=`${role}:${cleaned}`;
  if(seenMessages.has(key))return;
  seenMessages.add(key);
  if(seenMessages.size>80)seenMessages.delete(seenMessages.values().next().value);
  const item=document.createElement('div');
  item.className=`timeline-item ${role}`;
  item.innerHTML=`<div class="avatar-mini">${role==='assistant'?'P':'V'}</div><div class="bubble"><strong>${role==='assistant'?'Pink':'Você'}</strong><p></p><time>${nowLabel()}</time></div>`;
  item.querySelector('p').textContent=cleaned;
  timeline.appendChild(item);
  timeline.scrollTop=timeline.scrollHeight;
}
function setAgentNode(name){document.querySelectorAll('.agent-node').forEach(node=>node.classList.toggle('active',Boolean(name)&&node.dataset.node===name))}
function setPinkState(state,options={}){
  const meta=STATE[state]||STATE.idle;
  const stage=$('#pinkStage');
  if(!stage)return;
  if(state!=='error')lastStateBeforeError=state;
  stage.dataset.state=state;
  window.PinkEvolution?.recordState?.(state);
  $('#avatarStateText').textContent=meta.label;
  $('#systemBadge').textContent=meta.badge;
  $('#voiceStatus').textContent=fallbackVoiceActive
    ? (state==='listening'?'Contingência · ouvindo pelo dispositivo':state==='speaking'?'Contingência · voz do dispositivo':state==='thinking'?'Contingência · NVIDIA processando':'Contingência de voz ativa')
    : meta.voice;
  setAgentNode(meta.node);
  clearTimeout(stateFallbackTimer);
  if(options.fallbackMs)stateFallbackTimer=setTimeout(()=>setPinkState(callActive?'listening':'idle'),options.fallbackMs);
}
function updateConnectionStatus(){if(!callActive){$('#voiceStatus').textContent='ElevenLabs pronto · Roberta';$('#systemBadge').textContent='Pink online'}}
function loadElevenLabsSdk(){
  if(elevenLabsSdkPromise)return elevenLabsSdkPromise;
  elevenLabsSdkPromise=import(ELEVENLABS_CLIENT_CDN).then(mod=>{
    if(!mod?.Conversation?.startSession)throw new Error('ElevenLabs SDK não carregou Conversation.startSession');
    return mod;
  }).catch(error=>{elevenLabsSdkPromise=null;throw error});
  return elevenLabsSdkPromise;
}
const isIOSDevice=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function showWakeGate(mode='tap'){
  const gate=$('#wakeGate');if(!gate)return;
  const title=$('#wakeTitle'),text=$('#wakeText'),btn=$('#wakePinkBtn'),settings=$('#wakeSettingsBtn');
  gate.hidden=false;if(settings)settings.hidden=false;btn.dataset.mode='start';
  if(mode==='mic-denied'){
    title.textContent='Libere o microfone para a Pink';
    text.textContent='O navegador bloqueou o microfone. Toque em tentar novamente e aceite a permissão. No iPhone, prefira abrir a Pink no Safari.';
    btn.textContent='Tentar novamente';
  }else if(mode==='unsupported'){
    title.textContent='Abra a Pink em um navegador compatível';
    text.textContent='Este navegador não disponibilizou o microfone para a página. Abra o site no Safari ou Chrome e tente novamente.';
    btn.textContent='Tentar novamente';
  }else if(mode==='agent-private'){
    title.textContent='Agente ElevenLabs precisa estar público';
    text.textContent='A Pink está ligada ao Agent ID correto, mas o ElevenLabs exigiu autenticação. No agente, deixe o acesso público para uso direto no navegador.';
    btn.textContent='Tentar novamente';
  }else if(mode==='sdk-error'){
    title.textContent='Não consegui carregar o ElevenLabs';
    text.textContent='O SDK de voz não carregou. Verifique sua internet e tente novamente.';
    btn.textContent='Tentar novamente';
  }else if(mode==='error'){
    title.textContent='Não consegui iniciar a voz';
    text.textContent='O microfone foi solicitado, mas a conversa com a Pink não iniciou. Tente novamente.';
    btn.textContent='Tentar novamente';
  }else{
    title.textContent=isIOSDevice()?'Toque uma vez para acordar a Pink':'Falar com a Pink';
    text.textContent=isIOSDevice()?'Esse toque libera o áudio e o microfone e inicia a Pink com a voz Roberta.':'Toque para liberar o microfone e iniciar a conversa com a voz Roberta.';
    btn.textContent='Acordar a Pink';
  }
}
function hideWakeGate(){const gate=$('#wakeGate');if(gate)gate.hidden=true}
function renderVoiceControls(){
  const mount=$('#voiceWidgetMount');if(!mount)return;
  mount.innerHTML=`<div class="pink-call-control"><div class="call-status"><span class="call-ring"></span><div><small>ROBERTA · ELEVENLABS</small><strong id="callControlText">${callActive?'Conversa em andamento':startingCall?'Conectando à Pink…':'Pink pronta para falar'}</strong></div></div><button id="callControlBtn" class="primary-btn" ${startingCall?'disabled':''}>${callActive?'Encerrar conversa':startingCall?'Conectando…':'Falar com a Pink'}</button></div>`;
  $('#callControlBtn')?.addEventListener('click',()=>callActive?stopPinkCall():startPinkCall({userGesture:true}));
  updateConnectionStatus();
}
function handleElevenMessage(message){
  if(!message)return;
  const source=String(message.source||message.role||'').toLowerCase();
  const text=message.message||message.text||message.transcript||'';
  if(!text)return;
  elevenMessageCount += 1;
  if(source==='user'||source==='customer'){
    setPinkState('thinking');
    addMessage('user',text);
    window.PinkCore?.handleUserSpeech?.(text);
  }else if(source==='ai'||source==='assistant'||source==='agent'){
    setPinkState('speaking',{fallbackMs:1200});
    addMessage('assistant',text);
  }
}
function handleElevenModeChange(payload){
  const mode=String(payload?.mode||payload||'').toLowerCase();
  if(mode==='speaking')setPinkState('speaking');
  else if(mode==='listening')setPinkState('listening');
}
function handleElevenStatusChange(payload){
  const status=String(payload?.status||payload||'').toLowerCase();
  if(status==='connected'){
    startingCall=false;callActive=true;hideWakeGate();setPinkState('listening');renderVoiceControls();
  }else if(status==='connecting'){
    startingCall=true;setPinkState('thinking');renderVoiceControls();
  }else if(status==='disconnected'&&!startingCall){
    callActive=false;setPinkState('idle');renderVoiceControls();
  }
}
let audioUnlockContext=null;
async function unlockVoiceFromUserGesture(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  let resumePromise=Promise.resolve();
  if(AudioCtx){
    audioUnlockContext=audioUnlockContext||new AudioCtx();
    try{
      const source=audioUnlockContext.createBufferSource();const gain=audioUnlockContext.createGain();gain.gain.value=0;
      source.buffer=audioUnlockContext.createBuffer(1,1,22050);source.connect(gain);gain.connect(audioUnlockContext.destination);source.start(0);
    }catch(_){}
    if(audioUnlockContext.state==='suspended')resumePromise=audioUnlockContext.resume();
  }
  if(!navigator.mediaDevices?.getUserMedia){const e=new Error('microphone_api_unavailable');e.code='microphone_api_unavailable';throw e}
  const micPromise=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  await resumePromise;
  const stream=await micPromise;stream.getTracks().forEach(track=>track.stop());
}
function voiceErrorMode(error){
  const name=String(error?.name||'').toLowerCase();const msg=String(error?.message||error||'').toLowerCase();
  if(name.includes('notallowed')||name.includes('security')||msg.includes('permission')||msg.includes('not allowed'))return 'mic-denied';
  if(msg.includes('microphone_api_unavailable')||msg.includes('getusermedia'))return 'unsupported';
  if(msg.includes('401')||msg.includes('403')||msg.includes('authorization')||msg.includes('authentication')||msg.includes('private agent'))return 'agent-private';
  if(msg.includes('sdk')||msg.includes('import')||msg.includes('module'))return 'sdk-error';
  return 'error';
}

function isElevenQuotaError(error){
  const raw=String(error?.message||error?.detail||error||'').toLowerCase();
  return raw.includes('quota')||raw.includes('limit')||raw.includes('credit')||raw.includes('429')||raw.includes('exceeds your quota');
}
function browserSpeechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
function pushFallbackContext(text=''){
  const value=String(text).trim();if(!value)return;
  fallbackContextBuffer.push(value.slice(0,5000));
  if(fallbackContextBuffer.length>10)fallbackContextBuffer=fallbackContextBuffer.slice(-10);
}
function chooseDeviceVoice(){
  const voices=window.speechSynthesis?.getVoices?.()||[];
  return voices.find(v=>/^pt-BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang))||voices.find(v=>/portugu/i.test(v.name))||null;
}
function restartFallbackRecognition(delay=260){
  clearTimeout(fallbackRestartTimer);
  if(!fallbackVoiceActive||fallbackSpeaking)return;
  fallbackRestartTimer=setTimeout(()=>{
    if(!fallbackVoiceActive||fallbackSpeaking||!fallbackRecognition)return;
    try{fallbackRecognition.start()}catch(_){ }
  },delay);
}
function speakFallback(text=''){
  const cleaned=String(text).trim();if(!cleaned)return Promise.resolve();
  addMessage('assistant',cleaned);
  if(!window.speechSynthesis){setPinkState('listening');return Promise.resolve()}
  return new Promise(resolve=>{
    try{fallbackRecognition?.stop?.()}catch(_){ }
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(cleaned);
    utterance.lang='pt-BR';utterance.rate=.98;utterance.pitch=1.02;
    const voice=chooseDeviceVoice();if(voice)utterance.voice=voice;
    utterance.onstart=()=>{fallbackSpeaking=true;setPinkState('speaking')};
    utterance.onend=()=>{fallbackSpeaking=false;setPinkState('listening');restartFallbackRecognition();resolve()};
    utterance.onerror=()=>{fallbackSpeaking=false;setPinkState('listening');restartFallbackRecognition();resolve()};
    window.speechSynthesis.speak(utterance);
  });
}
async function fallbackRespond(text,{internal=false}={}){
  const cleaned=String(text).replace(/^\[PINK_INTERNAL_RESULT\]\s*/i,'').trim();if(!cleaned)return;
  setPinkState('thinking');
  const context=fallbackContextBuffer.slice(-6).join('\n---\n');
  const history=fallbackHistory.slice(-8);
  try{
    if(!window.PinkNVIDIA?.ask)throw new Error('NVIDIA indisponível');
    const result=await window.PinkNVIDIA.ask([
      {role:'system',content:'Você é Pink, assistente da Lean Performance Solutions. Responda sempre em português do Brasil, de forma natural e curta para voz. Use somente fatos disponíveis na conversa/contexto. Não invente ações nem acessos. Se o contexto disser que algo foi executado ou consultado, informe o resultado com precisão.'},
      ...(context?[{role:'system',content:`Contexto operacional recente da Pink:\n${context}`}]:[]),
      ...history,
      {role:'user',content:cleaned}
    ],{temperature:.25,maxTokens:420});
    const reply=String(result?.reply||'').trim()||'Estou te ouvindo. Pode repetir de outra forma?';
    fallbackHistory.push({role:'user',content:cleaned},{role:'assistant',content:reply});
    fallbackHistory=fallbackHistory.slice(-12);
    fallbackInternalPending=false;
    await speakFallback(reply);
  }catch(error){
    fallbackInternalPending=false;
    window.PinkEvolution?.recordIssue?.('fallback-voice-brain',error?.message||error);
    await speakFallback('Estou te ouvindo, mas meu modo de contingência não conseguiu processar a resposta agora. Tenta novamente em alguns segundos.');
  }
}
function fallbackConversationAdapter(){
  return {
    sendContextualUpdate(text){pushFallbackContext(text)},
    sendUserMessage(text){fallbackInternalPending=true;fallbackRespond(text,{internal:true})},
    sendUserActivity(){},
    async endSession(){stopFallbackVoice()},
  };
}
async function handleFallbackTranscript(text=''){
  const spoken=String(text).trim();if(!spoken)return;
  const serial=++fallbackTurnSerial;
  fallbackInternalPending=false;
  addMessage('user',spoken);setPinkState('thinking');
  try{window.PinkCore?.handleUserSpeech?.(spoken)}catch(error){console.warn('Pink fallback router error',error)}
  setTimeout(()=>{
    if(!fallbackVoiceActive||serial!==fallbackTurnSerial||fallbackInternalPending)return;
    fallbackRespond(spoken);
  },900);
}
function stopFallbackVoice(){
  fallbackVoiceActive=false;fallbackStarting=false;fallbackSpeaking=false;
  clearTimeout(fallbackRestartTimer);
  try{fallbackRecognition?.abort?.()}catch(_){ }
  fallbackRecognition=null;
  try{window.speechSynthesis?.cancel?.()}catch(_){ }
}
async function startFallbackVoice({userGesture=false,reason=''}={}){
  if(fallbackVoiceActive||fallbackStarting)return true;
  const Recognition=browserSpeechCtor();
  if(!Recognition){showWakeGate('unsupported');return false}
  fallbackStarting=true;
  try{
    if(userGesture)await unlockVoiceFromUserGesture();
    stopFallbackVoice();fallbackStarting=true;
    const recognition=new Recognition();
    recognition.lang='pt-BR';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
    fallbackRecognition=recognition;
    const adapter=fallbackConversationAdapter();conversation=adapter;
    recognition.onresult=(event)=>{
      const result=event.results?.[event.results.length-1];
      const transcript=result?.[0]?.transcript||'';
      if(transcript)handleFallbackTranscript(transcript);
    };
    recognition.onerror=(event)=>{
      const code=String(event?.error||'');
      if(!['no-speech','aborted'].includes(code))window.PinkEvolution?.recordIssue?.('fallback-speech-error',code);
    };
    recognition.onend=()=>restartFallbackRecognition();
    fallbackVoiceActive=true;fallbackStarting=false;callActive=true;startingCall=false;
    hideWakeGate();setPinkState('listening');renderVoiceControls();
    window.PinkCore?.attachConversation?.(adapter);
    window.PinkEvolution?.recordSession?.(`voice-fallback:${reason||'manual'}`);
    try{recognition.start()}catch(_){restartFallbackRecognition(120)}
    await speakFallback('Pink online. Estou te ouvindo.');
    return true;
  }catch(error){
    fallbackStarting=false;fallbackVoiceActive=false;callActive=false;conversation=null;
    window.PinkEvolution?.recordIssue?.('fallback-start-error',error?.message||error);
    showWakeGate(voiceErrorMode(error));
    return false;
  }
}
async function activateVoiceFallback(reason='elevenlabs-unavailable'){
  if(fallbackVoiceActive||fallbackStarting)return true;
  try{if(conversation&&!fallbackVoiceActive)await conversation.endSession?.()}catch(_){ }
  conversation=null;callActive=false;startingCall=false;
  return startFallbackVoice({userGesture:false,reason});
}

async function startPinkCall({userGesture=false,auto=false}={}){
  if(callActive||startingCall)return true;
  lastStartUserGesture=userGesture;
  startingCall=true;setPinkState('thinking');renderVoiceControls();
  try{
    if(userGesture)await unlockVoiceFromUserGesture();
    const {Conversation}=await loadElevenLabsSdk();
    conversation=await Conversation.startSession({
      agentId:ELEVENLABS_AGENT_ID,
      connectionType:'webrtc',
      onConnect:()=>{
        elevenConnectedAt=Date.now();elevenMessageCount=0;
        startingCall=false;callActive=true;hideWakeGate();setPinkState('listening');renderVoiceControls();
        window.PinkEvolution?.recordSession?.('elevenlabs-connected');
        addMessage('assistant','Pink online. Estou te ouvindo.');
      },
      onDisconnect:()=>{
        const wasActive=callActive;
        const rapidFailure=wasActive&&elevenConnectedAt>0&&(Date.now()-elevenConnectedAt<5000)&&elevenMessageCount===0;
        startingCall=false;callActive=false;
        window.PinkCore?.detachConversation?.();
        conversation=null;setPinkState('idle');renderVoiceControls();
        window.PinkEvolution?.recordSession?.(rapidFailure?'elevenlabs-rapid-failure':'elevenlabs-disconnected');
        if(rapidFailure){startFallbackVoice({userGesture:false,reason:'elevenlabs-rapid-failure'});return;}
        if(wasActive&&!fallbackVoiceActive)addMessage('assistant','Conversa encerrada. Quando quiser, pode falar comigo de novo.');
      },
      onMessage:handleElevenMessage,
      onModeChange:handleElevenModeChange,
      onStatusChange:handleElevenStatusChange,
      onError:(error)=>{
        window.PinkEvolution?.recordIssue?.('elevenlabs-error',error?.message||error);
        console.error('Pink/ElevenLabs error',error);
        if(isElevenQuotaError(error)){activateVoiceFallback('elevenlabs-quota');return;}
        setPinkState('error');
      }
    });
    window.PinkCore?.attachConversation?.(conversation);
    return true;
  }catch(error){
    console.warn('Pink voice start failed',error);
    window.PinkEvolution?.recordIssue?.('elevenlabs-start-error',error?.message||error);
    window.PinkCore?.detachConversation?.();
    startingCall=false;callActive=false;conversation=null;setPinkState('idle');renderVoiceControls();
    const mode=voiceErrorMode(error);
    if(isElevenQuotaError(error)||(!auto&&mode!=='mic-denied'&&mode!=='unsupported')){
      const recovered=await startFallbackVoice({userGesture:false,reason:isElevenQuotaError(error)?'elevenlabs-quota':'elevenlabs-start-error'});
      if(recovered)return true;
    }
    showWakeGate(auto?'tap':mode);
    return false;
  }
}
async function stopPinkCall(){
  if(fallbackVoiceActive){stopFallbackVoice();window.PinkCore?.detachConversation?.();conversation=null;callActive=false;startingCall=false;setPinkState('idle');renderVoiceControls();return;}
  const activeConversation=conversation;if(!activeConversation)return;
  try{await activeConversation.endSession()}catch(error){console.warn('Pink ElevenLabs stop error',error)}finally{
    window.PinkCore?.detachConversation?.();conversation=null;callActive=false;startingCall=false;setPinkState('idle');renderVoiceControls();
  }
}
function scheduleAutoGreeting(){
  if(autoStartAttempted)return;
  autoStartAttempted=true;
  loadElevenLabsSdk().catch(error=>console.warn('ElevenLabs preload failed',error));
  if(isIOSDevice()){showWakeGate('tap');return}
  setTimeout(()=>startPinkCall({auto:true}),650);
}
function renderVoiceWidget(){renderVoiceControls();scheduleAutoGreeting()}
function openSettings(){if(settingsDialog)settingsDialog.showModal()}
$('#settingsBtn')?.addEventListener('click',openSettings);
$('#clearBtn')?.addEventListener('click',()=>{timeline.innerHTML='';seenMessages.clear();addMessage('assistant','Sessão limpa. Pode falar comigo.')});
function demoSequence(text){
  addMessage('user',text);setPinkState('listening');
  setTimeout(()=>setPinkState('thinking'),900);
  setTimeout(()=>{setPinkState('speaking');addMessage('assistant','Entendi. Estou no modo ao vivo: ouvindo, pensando e respondendo com a voz Roberta pelo ElevenLabs.')},1900);
  setTimeout(()=>setPinkState(callActive?'listening':'idle'),5200);
}
$('#demoBtn')?.addEventListener('click',()=>demoSequence('Pink, me mostra como você reage enquanto eu falo.'));
document.querySelectorAll('.quick-commands button').forEach(button=>button.addEventListener('click',()=>demoSequence(button.dataset.command)));
$('#expandPreviewBtn')?.addEventListener('click',()=>{const card=document.querySelector('.preview-card');if(!document.fullscreenElement)card?.requestFullscreen?.();else document.exitFullscreen?.()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!callActive)setPinkState('idle')});
$('#wakePinkBtn')?.addEventListener('click',async()=>{
  const btn=$('#wakePinkBtn');if(!btn||btn.disabled)return;
  const original=btn.textContent;btn.disabled=true;btn.textContent='Conectando à Pink…';
  try{await startPinkCall({userGesture:true})}finally{if(!callActive){btn.disabled=false;btn.textContent=original==='Acordar a Pink'?'Tentar novamente':original}}
});
$('#wakeSettingsBtn')?.addEventListener('click',()=>{hideWakeGate();openSettings()});
window.addEventListener('load',()=>{setPinkState('idle');setTimeout(renderVoiceWidget,300)});
window.PinkVoice={
  agentId:ELEVENLABS_AGENT_ID,
  branchId:ELEVENLABS_BRANCH_ID,
  start:()=>startPinkCall({userGesture:true}),
  stop:stopPinkCall,
  startFallback:()=>startFallbackVoice({userGesture:true,reason:'manual'}),
  getConversation:()=>conversation,
  get mode(){return fallbackVoiceActive?'fallback':callActive?'elevenlabs':'idle'}
};

// === Pink V3 3D motion layer ===
(function initPinkV3(){
  const stage=document.querySelector('#pinkStage');
  if(stage){
    stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;stage.style.transform=`rotateY(${x*4.8}deg) rotateX(${-y*3.8}deg) translateZ(0)`});
    stage.addEventListener('pointerleave',()=>{stage.style.transform='rotateY(0deg) rotateX(0deg)'});
  }
  const canvas=document.querySelector('#fxCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');let w=0,h=0,dpr=1,pts=[];
  function resize(){
    dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
    pts=Array.from({length:Math.min(95,Math.floor(w/14))},()=>({x:Math.random()*w,y:Math.random()*h,r:.5+Math.random()*1.35,s:.07+Math.random()*.24,a:.08+Math.random()*.22,p:Math.random()}));
  }
  function draw(){
    ctx.clearRect(0,0,w,h);
    for(const p of pts){p.y-=p.s;if(p.y<-8){p.y=h+8;p.x=Math.random()*w}ctx.beginPath();ctx.fillStyle=p.p>.82?`rgba(255,105,190,${p.a})`:`rgba(110,215,255,${p.a})`;ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}
    requestAnimationFrame(draw);
  }
  addEventListener('resize',resize,{passive:true});resize();draw();
})();