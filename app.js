const DEFAULT_ASSISTANT_ID = '5db8d17f-e467-4275-9531-9ccd2c983ff1';
const $ = (sel) => document.querySelector(sel);
const timeline = $('#timeline');
const settingsDialog = $('#settingsDialog');
const keyStorage = 'pink_vapi_public_key';
const assistantStorage = 'pink_vapi_assistant_id';
let callActive = false;
let lastStateBeforeError = 'idle';
let stateFallbackTimer = null;
const seenMessages = new Set();
const STATE = {idle:{label:'Pronta',badge:'Pink em espera',voice:'Pronta para conversar',node:null},listening:{label:'Ouvindo você',badge:'Pink ouvindo',voice:'Ouvindo…',node:'listen'},thinking:{label:'Pensando',badge:'Pink pensando',voice:'Processando pedido…',node:'think'},speaking:{label:'Falando',badge:'Pink falando',voice:'Roberta · ElevenLabs',node:'speak'},executing:{label:'Executando',badge:'Pink executando',voice:'Executando ação…',node:'act'},error:{label:'Atenção',badge:'Verificar voz',voice:'Falha na conexão',node:null}};
function nowLabel(){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}
function addMessage(role,text){if(!text||!timeline)return;const cleaned=String(text).trim();if(!cleaned)return;const key=`${role}:${cleaned}`;if(seenMessages.has(key))return;seenMessages.add(key);if(seenMessages.size>80)seenMessages.delete(seenMessages.values().next().value);const item=document.createElement('div');item.className=`timeline-item ${role}`;item.innerHTML=`<div class="avatar-mini">${role==='assistant'?'P':'V'}</div><div class="bubble"><strong>${role==='assistant'?'Pink':'Você'}</strong><p></p><time>${nowLabel()}</time></div>`;item.querySelector('p').textContent=cleaned;timeline.appendChild(item);timeline.scrollTop=timeline.scrollHeight}
function getConfig(){return{publicKey:localStorage.getItem(keyStorage)||'',assistantId:localStorage.getItem(assistantStorage)||DEFAULT_ASSISTANT_ID}}
function setAgentNode(name){document.querySelectorAll('.agent-node').forEach(node=>node.classList.toggle('active',Boolean(name)&&node.dataset.node===name))}
function setPinkState(state,options={}){const meta=STATE[state]||STATE.idle;const stage=$('#pinkStage');if(!stage)return;if(state!=='error')lastStateBeforeError=state;stage.dataset.state=state;window.PinkEvolution?.recordState?.(state);$('#avatarStateText').textContent=meta.label;$('#systemBadge').textContent=meta.badge;$('#voiceStatus').textContent=meta.voice;setAgentNode(meta.node);clearTimeout(stateFallbackTimer);if(options.fallbackMs)stateFallbackTimer=setTimeout(()=>setPinkState(callActive?'listening':'idle'),options.fallbackMs)}
function updateConnectionStatus(configured){if(!configured){callActive=false;setPinkState('idle');$('#voiceStatus').textContent='Aguardando configuração';$('#systemBadge').textContent='Modo laboratório'}else if(!callActive){$('#voiceStatus').textContent='Vapi pronto · Roberta';$('#systemBadge').textContent='Pink online'}}
function normalizeMessage(detail){if(!detail)return null;if(detail.message&&typeof detail.message==='object')return detail.message;if(detail.detail&&typeof detail.detail==='object')return detail.detail;return detail}
function transcriptText(msg){return msg.transcript||msg.text||msg.message?.content||''}
function isFinalTranscript(msg){const t=String(msg.transcriptType||msg.transcript_type||msg.status||'').toLowerCase();if(!t)return true;return t.includes('final')||t==='completed'||t==='done'}
function handleSpeechUpdate(msg){const status=String(msg.status||msg.speechStatus||msg.speech_status||'').toLowerCase();const role=String(msg.role||msg.speaker||'').toLowerCase();if(role==='assistant'){if(/start|speaking|active/.test(status))setPinkState('speaking');if(/stop|end|inactive|finished/.test(status))setPinkState(callActive?'listening':'idle');return}if(role==='user'||role==='customer'){if(/start|speaking|active/.test(status))setPinkState('listening');if(/stop|end|inactive|finished/.test(status))setPinkState('thinking');return}if(/start/.test(status))setPinkState('speaking');if(/stop|end/.test(status))setPinkState(callActive?'listening':'idle')}
function handleVapiMessage(detail){const msg=normalizeMessage(detail);if(!msg||typeof msg!=='object')return;const type=String(msg.type||'').toLowerCase();if(type==='transcript'){const role=String(msg.role||'').toLowerCase();const text=transcriptText(msg);const final=isFinalTranscript(msg);if(role==='user'||role==='customer'){setPinkState(final?'thinking':'listening');if(final)addMessage('user',text)}else if(role==='assistant'){setPinkState('speaking',{fallbackMs:final?1500:0});if(final)addMessage('assistant',text)}return}if(type==='speech-update'){handleSpeechUpdate(msg);return}if(type==='assistant.speechstarted'||type==='assistant-speech-started'){setPinkState('speaking');if(msg.text)addMessage('assistant',msg.text);return}if(type==='user-interrupted'){setPinkState('listening');return}if(type.includes('tool')||type.includes('function'))setPinkState('executing',{fallbackMs:1800})}
let vapiClient=null;
let vapiSdkPromise=null;
let autoStartAttempted=false;
let startingCall=false;
function loadVapiSdk(){if(vapiSdkPromise)return vapiSdkPromise;vapiSdkPromise=import('https://cdn.jsdelivr.net/npm/@vapi-ai/web/+esm').then(m=>m.default||m.Vapi||m);return vapiSdkPromise}
function showWakeGate(mode='tap'){const gate=$('#wakeGate');if(!gate)return;const title=$('#wakeTitle'),text=$('#wakeText'),btn=$('#wakePinkBtn'),settings=$('#wakeSettingsBtn');gate.hidden=false;settings.hidden=false;btn.dataset.mode='start';if(mode==='configure'){title.textContent='Ative a voz da Pink';text.textContent='Configure a Public API Key do Vapi uma vez neste navegador.';btn.textContent='Configurar agora';btn.dataset.mode='configure';settings.hidden=true}else if(mode==='mic-denied'){title.textContent='Libere o microfone para a Pink';text.textContent='O iPhone não liberou o microfone. Toque em tentar novamente e aceite a permissão. Se estiver no navegador interno do ChatGPT e continuar bloqueado, abra este site no Safari.';btn.textContent='Tentar novamente'}else if(mode==='unsupported'){title.textContent='Abra a Pink no Safari';text.textContent='Este navegador não disponibilizou o microfone para a página. Abra o site no Safari para conversar com a Pink.';btn.textContent='Tentar novamente'}else if(mode==='vapi-auth'){title.textContent='Verifique a Public API Key';text.textContent='O microfone foi liberado, mas o Vapi recusou a conexão. Abra Configurar voz e confira a Public API Key.';btn.textContent='Tentar novamente'}else if(mode==='error'){title.textContent='Não consegui iniciar a voz';text.textContent='O microfone foi solicitado, mas a conexão de voz não iniciou. Tente novamente ou abra Configurar voz.';btn.textContent='Tentar novamente'}else{title.textContent=isIOSDevice()?'Toque uma vez para acordar a Pink':'Toque para acordar a Pink';text.textContent=isIOSDevice()?'No iPhone, este toque libera o áudio e o microfone e inicia a Pink com a voz Roberta.':'Seu navegador exige um toque para liberar áudio e microfone. Depois disso, a Pink fala com a voz Roberta.';btn.textContent='Acordar a Pink'}}
function hideWakeGate(){const gate=$('#wakeGate');if(gate)gate.hidden=true}
function renderVoiceControls(){const cfg=getConfig();const mount=$('#voiceWidgetMount');if(!mount)return;mount.innerHTML='';if(!cfg.publicKey){mount.innerHTML=`<div class="empty-state"><div class="mic-orb">🎙️</div><strong>Voz pronta para configurar</strong><p>Adicione a Public API Key do Vapi uma única vez. Depois a Pink tenta falar automaticamente ao abrir o site.</p><button id="configureVoiceBtn" class="primary-btn">Configurar voz</button></div>`;$('#configureVoiceBtn').addEventListener('click',openSettings);updateConnectionStatus(false);return}mount.innerHTML=`<div class="pink-call-control"><div class="call-status"><span class="call-ring"></span><div><small>ROBERTA · ELEVENLABS</small><strong id="callControlText">${callActive?'Conversa em andamento':'Pink pronta para falar'}</strong></div></div><button id="callControlBtn" class="primary-btn">${callActive?'Encerrar conversa':'Falar com a Pink'}</button></div>`;$('#callControlBtn').addEventListener('click',()=>callActive?stopPinkCall():startPinkCall({userGesture:true}));updateConnectionStatus(true)}
function bindVapiEvents(client){client.on('call-start',()=>{startingCall=false;callActive=true;hideWakeGate();setPinkState('listening');renderVoiceControls();addMessage('assistant','Conexão de voz iniciada. Estou te ouvindo.')});client.on('call-end',()=>{window.PinkEvolution?.recordSession?.('call-ended');startingCall=false;callActive=false;setPinkState('idle');renderVoiceControls();addMessage('assistant','Chamada encerrada. Quando quiser, pode falar comigo de novo.')});client.on('message',message=>handleVapiMessage(message));client.on('speech-start',()=>{if(callActive)setPinkState('speaking')});client.on('speech-end',()=>{if(callActive)setPinkState('listening')});client.on('error',error=>{window.PinkEvolution?.recordIssue?.('vapi-error',error?.message||error);console.error('Pink/Vapi error',error);startingCall=false;callActive=false;setPinkState('error');renderVoiceControls();showWakeGate('error');setTimeout(()=>setPinkState('idle'),2400)})}
async function ensureVapiClient(){const cfg=getConfig();if(!cfg.publicKey)throw new Error('missing_public_key');if(vapiClient)return vapiClient;const Vapi=await loadVapiSdk();vapiClient=new Vapi(cfg.publicKey);bindVapiEvents(vapiClient);return vapiClient}
const isIOSDevice=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let audioUnlockContext=null;
async function unlockVoiceFromUserGesture(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  let resumePromise=Promise.resolve();
  if(AudioCtx){
    audioUnlockContext=audioUnlockContext||new AudioCtx();
    try{
      const source=audioUnlockContext.createBufferSource();
      const gain=audioUnlockContext.createGain();
      gain.gain.value=0;
      source.buffer=audioUnlockContext.createBuffer(1,1,22050);
      source.connect(gain);gain.connect(audioUnlockContext.destination);source.start(0);
    }catch(_){}
    if(audioUnlockContext.state==='suspended')resumePromise=audioUnlockContext.resume();
  }
  if(!navigator.mediaDevices?.getUserMedia){const e=new Error('microphone_api_unavailable');e.code='microphone_api_unavailable';throw e}
  const micPromise=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  await resumePromise;
  const stream=await micPromise;
  stream.getTracks().forEach(track=>track.stop());
}
function voiceErrorMode(error){
  const name=String(error?.name||'').toLowerCase();
  const msg=String(error?.message||error||'').toLowerCase();
  if(name.includes('notallowed')||name.includes('security')||msg.includes('permission')||msg.includes('not allowed'))return 'mic-denied';
  if(msg.includes('microphone_api_unavailable')||msg.includes('getusermedia'))return 'unsupported';
  if(msg.includes('unauthorized')||msg.includes('invalid key')||msg.includes('401')||msg.includes('403'))return 'vapi-auth';
  return 'error';
}
async function startPinkCall({userGesture=false,auto=false}={}){
  if(callActive||startingCall)return true;
  const cfg=getConfig();
  if(!cfg.publicKey){showWakeGate('configure');return false}
  startingCall=true;setPinkState('thinking');renderVoiceControls();
  try{
    if(userGesture)await unlockVoiceFromUserGesture();
    const client=await ensureVapiClient();
    await client.start(cfg.assistantId);
    return true;
  }catch(error){
    console.warn('Pink voice start failed',error);
    startingCall=false;callActive=false;setPinkState('idle');renderVoiceControls();
    showWakeGate(userGesture?voiceErrorMode(error):'tap');
    return false;
  }
}
async function stopPinkCall(){if(!vapiClient||!callActive)return;try{await vapiClient.stop()}catch(error){console.warn('Pink stop error',error)}finally{callActive=false;startingCall=false;setPinkState('idle');renderVoiceControls()}}
function scheduleAutoGreeting(){if(autoStartAttempted)return;autoStartAttempted=true;const cfg=getConfig();if(!cfg.publicKey){showWakeGate('configure');renderVoiceControls();return}loadVapiSdk().catch(error=>console.warn('Vapi preload failed',error));if(isIOSDevice()){showWakeGate('tap');return}setTimeout(()=>startPinkCall({auto:true}),650)}
function renderVoiceWidget(){renderVoiceControls();scheduleAutoGreeting()}
function openSettings(){const cfg=getConfig();$('#publicKeyInput').value=cfg.publicKey;$('#assistantIdInput').value=cfg.assistantId;settingsDialog.showModal()}
$('#settingsBtn').addEventListener('click',openSettings);
$('#saveSettingsBtn').addEventListener('click',()=>{const key=$('#publicKeyInput').value.trim();const assistant=$('#assistantIdInput').value.trim()||DEFAULT_ASSISTANT_ID;if(key)localStorage.setItem(keyStorage,key);else localStorage.removeItem(keyStorage);localStorage.setItem(assistantStorage,assistant);vapiClient=null;autoStartAttempted=false;settingsDialog.close();hideWakeGate();renderVoiceWidget();addMessage('assistant','Voz ativada. Vou tentar falar automaticamente quando você entrar.');});
$('#removeKeyBtn').addEventListener('click',()=>{localStorage.removeItem(keyStorage);localStorage.removeItem(assistantStorage);vapiClient=null;autoStartAttempted=false;settingsDialog.close();renderVoiceWidget();showWakeGate('configure');addMessage('assistant','Removi a Public API Key deste navegador.');});
$('#clearBtn').addEventListener('click',()=>{timeline.innerHTML='';seenMessages.clear();addMessage('assistant','Sessão limpa. Pode falar comigo.')});
function demoSequence(text){addMessage('user',text);setPinkState('listening');setTimeout(()=>setPinkState('thinking'),900);setTimeout(()=>{setPinkState('speaking');addMessage('assistant','Entendi. Estou no modo ao vivo: ouvindo, pensando e respondendo com a voz Roberta. A próxima etapa liga esses comandos às telas e ações dos seus sistemas.')},1900);setTimeout(()=>setPinkState(callActive?'listening':'idle'),5200)}
$('#demoBtn').addEventListener('click',()=>demoSequence('Pink, me mostra como você reage enquanto eu falo.'));document.querySelectorAll('.quick-commands button').forEach(button=>button.addEventListener('click',()=>demoSequence(button.dataset.command)));
$('#expandPreviewBtn').addEventListener('click',()=>{const card=document.querySelector('.preview-card');if(!document.fullscreenElement)card.requestFullscreen?.();else document.exitFullscreen?.()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!callActive)setPinkState('idle')});$('#wakePinkBtn')?.addEventListener('click',async()=>{const btn=$('#wakePinkBtn');if(btn?.dataset.mode==='configure'){hideWakeGate();openSettings();return}if(!btn||btn.disabled)return;const original=btn.textContent;btn.disabled=true;btn.textContent='Liberando microfone…';try{await startPinkCall({userGesture:true})}finally{if(!callActive){btn.disabled=false;btn.textContent=original==='Acordar a Pink'?'Tentar novamente':original}}});$('#wakeSettingsBtn')?.addEventListener('click',()=>{hideWakeGate();openSettings()});window.addEventListener('load',()=>{setPinkState('idle');setTimeout(renderVoiceWidget,300)});


// === Pink V3 3D motion layer ===
(function initPinkV3(){
  const stage=document.querySelector('#pinkStage');
  if(stage){
    stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;stage.style.transform=`rotateY(${x*4.8}deg) rotateX(${-y*3.8}deg) translateZ(0)`});
    stage.addEventListener('pointerleave',()=>{stage.style.transform='rotateY(0deg) rotateX(0deg)'});
  }
  const canvas=document.querySelector('#fxCanvas'); if(!canvas)return; const ctx=canvas.getContext('2d'); let w=0,h=0,dpr=1,pts=[];
  function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);pts=Array.from({length:Math.min(95,Math.floor(w/14))},()=>({x:Math.random()*w,y:Math.random()*h,r:.5+Math.random()*1.35,s:.07+Math.random()*.24,a:.08+Math.random()*.22,p:Math.random()}))}
  function draw(){ctx.clearRect(0,0,w,h);for(const p of pts){p.y-=p.s;if(p.y<-8){p.y=h+8;p.x=Math.random()*w}ctx.beginPath();ctx.fillStyle=p.p>.82?`rgba(255,105,190,${p.a})`:`rgba(110,215,255,${p.a})`;ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}requestAnimationFrame(draw)}
  addEventListener('resize',resize,{passive:true});resize();draw();
})();
