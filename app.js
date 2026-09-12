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
  $('#voiceStatus').textContent=meta.voice;
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
async function startPinkCall({userGesture=false,auto=false}={}){
  if(callActive||startingCall)return true;
  startingCall=true;setPinkState('thinking');renderVoiceControls();
  try{
    if(userGesture)await unlockVoiceFromUserGesture();
    const {Conversation}=await loadElevenLabsSdk();
    conversation=await Conversation.startSession({
      agentId:ELEVENLABS_AGENT_ID,
      connectionType:'webrtc',
      onConnect:()=>{
        startingCall=false;callActive=true;hideWakeGate();setPinkState('listening');renderVoiceControls();
        window.PinkEvolution?.recordSession?.('elevenlabs-connected');
        addMessage('assistant','Pink online. Estou te ouvindo.');
      },
      onDisconnect:()=>{
        const wasActive=callActive;startingCall=false;callActive=false;
        window.PinkCore?.detachConversation?.();
        conversation=null;setPinkState('idle');renderVoiceControls();
        window.PinkEvolution?.recordSession?.('elevenlabs-disconnected');
        if(wasActive)addMessage('assistant','Conversa encerrada. Quando quiser, pode falar comigo de novo.');
      },
      onMessage:handleElevenMessage,
      onModeChange:handleElevenModeChange,
      onStatusChange:handleElevenStatusChange,
      onError:(error)=>{
        window.PinkEvolution?.recordIssue?.('elevenlabs-error',error?.message||error);
        console.error('Pink/ElevenLabs error',error);setPinkState('error');
      }
    });
    window.PinkCore?.attachConversation?.(conversation);
    return true;
  }catch(error){
    console.warn('Pink voice start failed',error);
    window.PinkEvolution?.recordIssue?.('elevenlabs-start-error',error?.message||error);
    window.PinkCore?.detachConversation?.();
    startingCall=false;callActive=false;conversation=null;setPinkState('idle');renderVoiceControls();
    showWakeGate(auto?'tap':voiceErrorMode(error));
    return false;
  }
}
async function stopPinkCall(){
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
  getConversation:()=>conversation
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