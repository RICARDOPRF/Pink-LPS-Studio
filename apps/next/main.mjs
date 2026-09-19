import { PinkAgentMeshView } from './agent-mesh-view.mjs';
import { PinkSpatialPresence } from './spatial-presence.mjs';
import { createPinkNextRuntime } from '../../packages/next-runtime/index.mjs';
import { MemoryLayer } from '../../packages/contracts/index.mjs';

const config = globalThis.PinkPublicConfig || {};
const runtime = createPinkNextRuntime({ config, storage: globalThis.localStorage, satelliteStorage: globalThis.sessionStorage });
globalThis.PinkNext = runtime;

const $ = (s) => document.querySelector(s);
const dashboard = $('#dashboard');
const taskList = $('#task-list');
const prompt = $('#prompt');
const shell = $('.app-shell');
const health = $('#health-strip');
const modeToggle = $('#mode-toggle');
const spatialToggle = $('#spatial-toggle');
const spatialStage = $('#spatial-stage');
const spatialOrbit = $('#spatial-orbit');
const spatialStatus = $('#spatial-status');
const spatialLinks = $('#spatial-links');
const spatialParticles = $('#spatial-particles');
const spatialCore = $('#spatial-core');
const spatialTaskCount = $('#spatial-task-count');
const spatialAgentCount = $('#spatial-agent-count');
const spatialCoreState = $('#spatial-core-state');
const spatialQuality = $('#spatial-quality');
const spatialCamera = $('#spatial-camera');
const agentMeshPanel = $('#agent-mesh-panel');
const agentMeshClose = $('#agent-mesh-close');
const spatialReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
const spatialLife = { raf:0, startedAt:0, selected:null, lastHud:0, running:false };
runtime.spatial.setReducedMotion(spatialReducedMotion);
const spatialPresence = new PinkSpatialPresence({ runtime });
const agentMeshView = agentMeshPanel ? new PinkAgentMeshView({ runtime, root:agentMeshPanel }) : null;
const productionCloudAllowed = location.origin === 'https://ricardoprf.github.io';
let lastReply = '';
let lastProvider = '';
let currentView = 'home';
let satelliteProbe = null;
let satelliteMessage = '';
let satelliteOutput = null;
let satelliteImage = null;
let pendingSatelliteApproval = null;

function chip(label, ok = true) { return `<span class="chip ${ok ? 'ok' : ''}">${label}</span>`; }
function badge(state) { const ok = ['available','completed','running'].includes(state); return `<span class="badge ${ok ? 'ok' : 'warn'}">${escapeHtml(state)}</span>`; }

function renderHealth() {
  const caps = runtime.tools.list();
  const available = caps.filter((c) => c.state === 'available').length;
  const sat = runtime.satellite.snapshot();
  health.innerHTML = [
    chip('NEXT runtime'),
    chip(`${available}/${caps.length} capabilities`, available > 0),
    chip(runtime.cloud.configured ? 'Cloud adapters' : 'Cloud offline', runtime.cloud.configured),
    chip(sat.paired ? 'Satellite conectado' : 'Satellite offline', sat.paired),
    chip('Approval Gate'),
    chip('Legacy safe')
  ].join('');
}

function renderTasks() {
  const tasks = runtime.taskRuntime.list().slice().reverse();
  taskList.innerHTML = tasks.length ? tasks.slice(0,8).map((t) => `<article class="task-card"><strong>${escapeHtml(t.goal)}</strong><small>${t.status} · etapa ${Math.min(t.currentStep + 1, Math.max(1,t.plan.length))}/${Math.max(1,t.plan.length)}</small></article>`).join('') : '<div class="metric-sub">Nenhuma tarefa criada nesta instalação.</div>';
}

function replyPanel() {
  if (!lastReply) return '<article class="panel"><h2>Pink</h2><p class="metric-sub">O cérebro existente é acessado por adapter. Credenciais privadas continuam no backend.</p></article>';
  return `<article class="panel"><h2>Pink · ${escapeHtml(lastProvider || 'brain')}</h2><p class="assistant-reply">${escapeHtml(lastReply)}</p></article>`;
}

function satellitePanel() {
  const state = runtime.satellite.snapshot();
  const device = state.device || satelliteProbe;
  const capabilities = device?.capabilities || [];
  const rows = capabilities.length ? capabilities.map((cap) => `<div class="row"><span>${escapeHtml(cap.title || cap.id)}</span><span>${badge(cap.state || 'unknown')} <span class="badge">${escapeHtml(cap.risk || '')}</span></span></div>`).join('') : '<div class="metric-sub">Inicie o Pink Satellite no Windows e clique em “Detectar”.</div>';
  const output = satelliteOutput ? `<pre class="sat-output">${escapeHtml(JSON.stringify(satelliteOutput, null, 2))}</pre>` : '';
  const image = satelliteImage ? `<img class="sat-image" alt="Captura autorizada da tela" src="data:${escapeHtml(satelliteImage.mime)};base64,${satelliteImage.base64}">` : '';
  const approval = pendingSatelliteApproval ? `<div class="sat-approval"><strong>Aprovação local necessária</strong><p>Veja o código exibido na janela do Pink Satellite e digite abaixo.</p><div class="sat-form"><input id="sat-approval-code" inputmode="numeric" maxlength="6" placeholder="Código local"><button id="sat-approval-confirm" type="button">Confirmar</button></div></div>` : '';
  const paired = state.paired;
  return `
    <article class="panel satellite-card">
      <h2>Pink Satellite Windows</h2>
      <div class="metric">${paired ? 'ONLINE' : 'LOCAL'}</div>
      <div class="metric-sub">${paired ? escapeHtml(device?.name || 'Dispositivo pareado') : 'Runtime local em 127.0.0.1:8777'}</div>
      <div class="sat-form sat-pair">
        <button id="sat-probe" type="button" class="ghost">Detectar</button>
        ${paired ? '<button id="sat-disconnect" type="button" class="ghost">Desconectar</button>' : '<input id="sat-pair-code" inputmode="numeric" maxlength="6" placeholder="Código de pareamento"><button id="sat-pair" type="button">Parear</button>'}
      </div>
      ${satelliteMessage ? `<p class="sat-message">${escapeHtml(satelliteMessage)}</p>` : ''}
    </article>
    <article class="panel"><h2>Capabilities locais</h2><div class="list">${rows}</div></article>
    <article class="panel">
      <h2>Ações seguras</h2>
      <div class="sat-actions">
        <button id="sat-system" type="button" ${paired ? '' : 'disabled'}>Sistema</button>
        <button id="sat-files" type="button" ${paired ? '' : 'disabled'}>Arquivos permitidos</button>
        <button id="sat-screen" type="button" ${paired ? '' : 'disabled'}>Capturar tela</button>
      </div>
      <p class="metric-sub">Leitura comum é direta. Tela/câmera e ações com efeito exigem código local de aprovação. Terminal genérico permanece bloqueado.</p>
      ${approval}${output}${image}
    </article>
    <article class="panel"><h2>Segurança local</h2><div class="list"><div class="row"><span>Listener</span><span class="badge ok">127.0.0.1</span></div><div class="row"><span>Sessão</span><span class="badge">efêmera</span></div><div class="row"><span>Arquivos de segredo</span><span class="badge warn">DENY</span></div><div class="row"><span>Terminal genérico</span><span class="badge warn">DENY</span></div></div></article>`;
}

function renderDashboard(view = currentView) {
  currentView = view;
  const snapshot = runtime.snapshot();
  const caps = snapshot.capabilities;
  const available = caps.filter((c) => c.state === 'available');
  const evo = snapshot.evolution;
  const taskRows = snapshot.tasks.slice(-4).reverse().map((t) => `<div class="row"><span>${escapeHtml(t.goal.slice(0,70))}</span>${badge(t.status)}</div>`).join('') || '<div class="metric-sub">Sem tarefas.</div>';
  const capRows = caps.slice(0,7).map((c) => `<div class="row"><span>${escapeHtml(c.title)}</span>${badge(c.state)}</div>`).join('');

  const panels = {
    home: `
      <article class="panel"><h2>Task Runtime</h2><div class="metric">${snapshot.tasks.length}</div><div class="metric-sub">tarefas persistidas</div><div class="list">${taskRows}</div></article>
      <article class="panel"><h2>Capabilities</h2><div class="metric">${available.length}/${caps.length}</div><div class="metric-sub">verificáveis nesta sessão</div><div class="list">${capRows}</div></article>
      <article class="panel"><h2>Satellite</h2><div class="metric">${snapshot.satellite?.paired ? 'ON' : 'OFF'}</div><div class="metric-sub">braços locais do Windows com pareamento e aprovação local</div></article>
      <article class="panel"><h2>Security</h2><div class="metric">HOST</div><div class="metric-sub">constraints e approvals são avaliados fora do modelo</div></article>
      <article class="panel"><h2>Evolution</h2><div class="metric">${evo.length}</div><div class="metric-sub">candidatos · código exige acordo humano + baseline</div></article>
      ${replyPanel()}`,
    tasks: `<article class="panel"><h2>Tarefas</h2><div class="list">${taskRows}</div></article><article class="panel"><h2>Continuação</h2><p class="metric-sub">Checkpoint, pause e resume pertencem ao Task Runtime — não ao histórico do chat.</p></article>${replyPanel()}`,
    memory: `<article class="panel"><h2>Memory V2</h2><div class="list">${Object.values(MemoryLayer).map((x)=>`<div class="row"><span>${x}</span><span class="badge">layer</span></div>`).join('')}</div></article><article class="panel"><h2>Context Compiler</h2><p class="metric-sub">A memória relevante é compilada de forma limitada. Evidência bruta permanece separada para drill-down.</p></article>`,
    skills: `<article class="panel"><h2>Skills</h2><div class="metric">${snapshot.skills.length}</div><div class="metric-sub">procedimentos reutilizáveis registrados</div></article><article class="panel"><h2>Tool Search</h2><p class="metric-sub">Capabilities são descobertas progressivamente; o cérebro não recebe o catálogo inteiro em todo turno.</p></article>`,
    satellite: satellitePanel(),
    evolution: `<article class="panel"><h2>Autoevolução 2.0</h2><p class="metric-sub">Observe → trace → candidate → Dar de acordo → baseline → implementação → evals → A/B → Draft PR.</p></article><article class="panel"><h2>Gate</h2><div class="metric">HUMAN</div><div class="metric-sub">sem acordo: sem alteração de código. Sem aprovação final: sem produção.</div></article>`,
    security: `<article class="panel"><h2>Constraint Register</h2><div class="list"><div class="row"><span>Merge main automático</span><span class="badge warn">DENY</span></div><div class="row"><span>Publicação automática</span><span class="badge warn">DENY</span></div><div class="row"><span>Expor secrets</span><span class="badge warn">DENY</span></div><div class="row"><span>Enfraquecer auth/RLS</span><span class="badge warn">DENY</span></div></div></article><article class="panel"><h2>Trust Boundary</h2><p class="metric-sub">Conteúdo de web/MCP/tools é dado não confiável. O risco final é calculado pelo host.</p></article>`
  };
  dashboard.innerHTML = panels[view] || panels.home;
  bindViewActions(view);
}


function spatialTargets() {
  return runtime.spatial.snapshot().targets.filter((x) => x.id !== 'pink-core');
}
function renderSpatialParticles() {
  if (!spatialParticles) return;
  spatialParticles.textContent='';
  const budget=runtime.spatial.sceneTransform().particleBudget;
  const count=Math.max(6,Math.min(24,Math.floor(budget/30)));
  for(let i=0;i<count;i++){
    const dot=document.createElement('i'); dot.className='spatial-particle';
    dot.style.left=((i*37)%97+1)+'%'; dot.style.top=((i*61)%89+4)+'%';
    dot.style.setProperty('--dx',(((i%5)-2)*13)+'px'); dot.style.setProperty('--dy',((((i*3)%7)-3)*9)+'px');
    dot.style.setProperty('--duration',(6+(i%6)*1.25)+'s'); dot.style.animationDelay=(-i*.37)+'s';
    spatialParticles.appendChild(dot);
  }
}
function renderSpatialMissionControl() {
  if (!spatialOrbit) return;
  const snapshot = runtime.spatial.snapshot();
  const targets = spatialTargets();
  spatialOrbit.textContent = ''; if(spatialLinks) spatialLinks.textContent='';
  targets.forEach((target,index) => {
    const button=document.createElement('button'); button.type='button'; button.className='spatial-node'; button.dataset.spatialTarget=target.id; button.dataset.index=String(index); button.dataset.live='idle';
    button.innerHTML='<small>'+escapeHtml(target.kind.toUpperCase())+'</small><strong>'+escapeHtml(target.label)+'</strong>';
    button.addEventListener('click',()=>{
      const ev=runtime.spatial.selectTarget(target.id,{evidenceRefs:['spatial-ui-selection']});
      spatialLife.selected=target.id; updateSpatialSelection();
      if(spatialStatus) spatialStatus.textContent='SELECTED · '+target.label.toUpperCase();
      if(target.id==='agent-mesh')agentMeshView?.show();else agentMeshView?.hide();
      window.dispatchEvent(new CustomEvent('pinknext:spatial-select',{detail:ev}));
    });
    spatialOrbit.appendChild(button);
    if(spatialLinks){
      const line=document.createElementNS('http://www.w3.org/2000/svg','line'); line.classList.add('spatial-link'); line.dataset.linkTarget=target.id;
      line.setAttribute('x1','50'); line.setAttribute('y1','50'); line.setAttribute('x2','50'); line.setAttribute('y2','50'); spatialLinks.appendChild(line);
    }
  });
  renderSpatialParticles(); updateSpatialHud(true); layoutSpatialFrame(performance.now());
}
function updateSpatialSelection(){
  spatialOrbit?.querySelectorAll('.spatial-node').forEach(node=>node.classList.toggle('is-selected',node.dataset.spatialTarget===spatialLife.selected));
  spatialLinks?.querySelectorAll('.spatial-link').forEach(line=>line.classList.toggle('is-selected',line.dataset.linkTarget===spatialLife.selected));
}
function updateSpatialHud(force=false){
  const now=performance.now(); if(!force&&now-spatialLife.lastHud<250)return; spatialLife.lastHud=now;
  const snap=runtime.snapshot(); const running=(snap.tasks||[]).filter(x=>x.status==='running').length; const agents=snap.agentMesh?.nodes?.length||0;
  if(spatialTaskCount)spatialTaskCount.textContent=String(running);
  if(spatialAgentCount)spatialAgentCount.textContent=String(agents);
  if(spatialCoreState)spatialCoreState.textContent=running?'WORKING':'IDLE';
  spatialCore?.setAttribute('data-live',running?'active':'idle');
  const mission=spatialOrbit?.querySelector('[data-spatial-target="mission-control"]'); if(mission)mission.dataset.live=running?'active':'idle';
}
function layoutSpatialFrame(now=performance.now()){
  const targets=spatialTargets(),nodes=[...(spatialOrbit?.querySelectorAll('.spatial-node')||[])]; if(!nodes.length)return;
  const snap=runtime.spatial.snapshot(); const quality=snap.quality; const speed=spatialReducedMotion?0:(quality==='ultra'?.00009:quality==='lite'?.000035:.00006);
  const elapsed=spatialLife.startedAt?now-spatialLife.startedAt:0;
  nodes.forEach((node,index)=>{
    const angle=(index/nodes.length)*Math.PI*2-Math.PI/2+elapsed*speed;
    const depth=(Math.sin(angle)+1)/2,rx=quality==='lite'?34:38,ry=quality==='lite'?25:31;
    const x=50+Math.cos(angle)*rx,y=50+Math.sin(angle)*ry;
    node.style.left=x.toFixed(3)+'%';node.style.top=y.toFixed(3)+'%';
    node.style.transform='translate(-50%,-50%) scale('+(0.82+depth*.2).toFixed(3)+')';
    node.style.opacity=(0.62+depth*.38).toFixed(3);node.style.zIndex=String(6+Math.round(depth*8));node.dataset.depth=depth>.58?'front':'back';
    const line=spatialLinks?.querySelector('[data-link-target="'+CSS.escape(targets[index]?.id||'')+'"]');if(line){line.setAttribute('x2',x.toFixed(3));line.setAttribute('y2',y.toFixed(3));line.style.opacity=String(.35+depth*.4)}
  });
  updateSpatialHud();
}
function applyCameraPose(){
  const snap=runtime.spatial.snapshot();if(snap.pose.source!=='camera')return;
  const t=snap.transform;if(spatialCore){spatialCore.style.transform='translate(calc(-50% + '+(t.parallaxX*150).toFixed(1)+'px),calc(-50% + '+(t.parallaxY*110).toFixed(1)+'px)) translateZ('+(t.depth*140).toFixed(1)+'px)';spatialCore.style.setProperty('--gaze-x',(snap.pose.x*8).toFixed(1)+'px');spatialCore.style.setProperty('--gaze-y',(snap.pose.y*6).toFixed(1)+'px')}
  if(spatialStatus)spatialStatus.textContent='CAMERA · '+snap.quality.toUpperCase();
}
async function toggleSpatialCamera(){
  if(spatialPresence.active){spatialPresence.disable({stopCamera:true});spatialCamera?.setAttribute('aria-pressed','false');if(spatialCamera)spatialCamera.textContent='CAM OFF';return}
  if(spatialCamera)spatialCamera.textContent='CAM…';
  try{await spatialPresence.enable();spatialCamera?.setAttribute('aria-pressed','true');if(spatialCamera)spatialCamera.textContent='CAM ON'}catch(_){if(spatialCamera)spatialCamera.textContent='CAM ERR'}
}
function spatialLoop(now){
  if(!spatialLife.running)return;
  if(shell.dataset.spatial==='on'&&!document.hidden){layoutSpatialFrame(now);applyCameraPose();}
  spatialLife.raf=requestAnimationFrame(spatialLoop);
}
function startSpatialLife(){
  if(spatialLife.running)return;spatialLife.running=true;spatialLife.startedAt=performance.now();spatialLife.raf=requestAnimationFrame(spatialLoop);
}
function stopSpatialLife(){spatialLife.running=false;cancelAnimationFrame(spatialLife.raf);spatialLife.raf=0;}
function setSpatialPointer(event){
  if(shell.dataset.spatial!=='on'||!spatialStage)return;
  const r=spatialStage.getBoundingClientRect(); if(!r.width||!r.height)return;
  const x=((event.clientX-r.left)/r.width-.5)*2,y=((event.clientY-r.top)/r.height-.5)*2;
  runtime.spatial.setPointer({x,y,source:event.pointerType==='touch'?'touch':'pointer'});
  const t=runtime.spatial.sceneTransform();
  if(spatialCore)spatialCore.style.transform='translate(calc(-50% + '+(t.parallaxX*90).toFixed(1)+'px),calc(-50% + '+(t.parallaxY*70).toFixed(1)+'px)) translateZ('+(t.depth*100).toFixed(1)+'px)';
  if(spatialStatus)spatialStatus.textContent=runtime.spatial.snapshot().pose.source.toUpperCase()+' · '+runtime.spatial.snapshot().quality.toUpperCase();
}
function cycleSpatialQuality(){
  const values=['lite','balanced','ultra'],current=runtime.spatial.snapshot().quality,next=values[(values.indexOf(current)+1)%values.length];
  runtime.spatial.setQuality(next); if(spatialQuality)spatialQuality.textContent=next.toUpperCase(); if(spatialStatus)spatialStatus.textContent=runtime.spatial.snapshot().pose.source.toUpperCase()+' · '+next.toUpperCase();
  renderSpatialParticles(); layoutSpatialFrame(performance.now());
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function setSatelliteMessage(message, output = null) {
  satelliteMessage = String(message || '');
  satelliteOutput = output;
  renderHealth(); renderDashboard('satellite');
}

async function probeSatellite() {
  try {
    satelliteProbe = await runtime.satellite.probe();
    setSatelliteMessage(`Satellite detectado: ${satelliteProbe.name || satelliteProbe.deviceId || 'dispositivo local'}`);
  } catch (error) {
    satelliteProbe = null;
    setSatelliteMessage(`Satellite não detectado: ${String(error?.message || error)}`);
  }
}

async function pairSatellite() {
  const code = $('#sat-pair-code')?.value?.trim();
  if (!code) return setSatelliteMessage('Digite o código de 6 dígitos exibido no Pink Satellite.');
  try {
    const device = await runtime.pairSatellite(code);
    satelliteProbe = device;
    setSatelliteMessage(`Pareado com ${device?.name || device?.deviceId || 'Pink Satellite'}.`);
  } catch (error) {
    setSatelliteMessage(`Pareamento recusado: ${String(error?.message || error)}`);
  }
}

async function satelliteInvoke(capability, args = {}) {
  try {
    const result = await runtime.satellite.invoke(capability, args);
    satelliteOutput = result?.result || result;
    satelliteMessage = `${capability} concluído.`;
    renderDashboard('satellite');
    return result;
  } catch (error) {
    if (error?.status === 428 || error?.payload?.error === 'local_approval_required') {
      const requested = await runtime.satellite.requestApproval(capability);
      pendingSatelliteApproval = { capability, args, approvalId: requested.approvalId };
      satelliteMessage = `Ação ${capability} aguarda aprovação local.`;
      renderDashboard('satellite');
      return null;
    }
    setSatelliteMessage(`${capability} falhou: ${String(error?.message || error)}`);
    return null;
  }
}

async function confirmSatelliteApproval() {
  const code = $('#sat-approval-code')?.value?.trim();
  if (!pendingSatelliteApproval || !code) return;
  try {
    const approved = await runtime.satellite.confirmApproval(pendingSatelliteApproval.approvalId, code);
    const pending = pendingSatelliteApproval;
    pendingSatelliteApproval = null;
    const response = await runtime.satellite.invoke(pending.capability, pending.args, { approvalToken: approved.approvalToken, timeoutMs: 20_000 });
    if (pending.capability === 'screen.capture' && response?.result?.base64) {
      satelliteImage = response.result;
      satelliteOutput = { capability: pending.capability, bytes: response.result.bytes, mime: response.result.mime };
    } else {
      satelliteOutput = response?.result || response;
    }
    satelliteMessage = `${pending.capability} autorizado localmente e concluído.`;
    renderDashboard('satellite');
  } catch (error) {
    pendingSatelliteApproval = null;
    setSatelliteMessage(`Aprovação/execução falhou: ${String(error?.message || error)}`);
  }
}

function bindViewActions(view) {
  if (view !== 'satellite') return;
  $('#sat-probe')?.addEventListener('click', probeSatellite);
  $('#sat-pair')?.addEventListener('click', pairSatellite);
  $('#sat-disconnect')?.addEventListener('click', () => { runtime.disconnectSatellite(); satelliteMessage = 'Satellite desconectado desta sessão do navegador.'; satelliteOutput = null; satelliteImage = null; pendingSatelliteApproval = null; renderHealth(); renderDashboard('satellite'); });
  $('#sat-system')?.addEventListener('click', () => satelliteInvoke('system.snapshot'));
  $('#sat-files')?.addEventListener('click', () => satelliteInvoke('files.list'));
  $('#sat-screen')?.addEventListener('click', () => satelliteInvoke('screen.capture'));
  $('#sat-approval-confirm')?.addEventListener('click', confirmSatelliteApproval);
}

async function executePrompt() {
  const goal = prompt.value.trim(); if (!goal) return;
  const task = runtime.supervisor.createTask(goal, { source: 'command-center' });
  runtime.taskRuntime.start(task.id);
  runtime.memory.remember({ layer: MemoryLayer.WORKING, type: 'task', text: goal, source: 'command-center', importance: .65 });
  prompt.value = ''; renderTasks(); renderDashboard('tasks');
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === 'tasks'));

  if (!productionCloudAllowed || !runtime.cloud.configured) return;
  const trace = runtime.traces.start({ taskId: task.id, goal, variant: 'current' });
  try {
    runtime.traces.event(trace, 'provider', { name: 'pink-brain' });
    const response = await runtime.cloud.brain(goal);
    lastReply = String(response?.reply || response?.output || '').trim();
    lastProvider = String(response?.provider || 'pink-brain');
    runtime.traces.finish(trace, { success: Boolean(lastReply), tokens: response?.usage?.total_tokens || null });
    if (lastReply) {
      runtime.taskRuntime.completeStep(task.id, { type:'provider_response', source:lastProvider, summary:lastReply.slice(0,240), data:{ model:response?.model || null } });
      runtime.memory.remember({ layer: MemoryLayer.WORKING, type:'assistant_response', text:lastReply, source:lastProvider, importance:.45 });
    }
  } catch (error) {
    runtime.traces.event(trace, 'error', { name:'pink-brain', message:String(error?.message || error) });
    runtime.traces.finish(trace, { success:false });
    lastReply = `Cérebro indisponível nesta chamada: ${String(error?.message || error)}`;
    lastProvider = 'runtime';
  }
  renderTasks(); renderDashboard('tasks');
}

$('#send').addEventListener('click', executePrompt);
prompt.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); executePrompt(); } });

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active')); button.classList.add('active'); renderDashboard(button.dataset.view);
}));

spatialToggle?.addEventListener('click',()=>{const on=shell.dataset.spatial!=='on';shell.dataset.spatial=on?'on':'off';spatialToggle.setAttribute('aria-pressed',String(on));spatialStage.hidden=!on;if(on){renderSpatialMissionControl();startSpatialLife()}else stopSpatialLife();});
spatialStage?.addEventListener('pointermove',setSpatialPointer,{passive:true});
spatialStage?.addEventListener('pointerleave',()=>{runtime.spatial.setPointer({x:0,y:0});if(spatialCore)spatialCore.style.transform='translate(-50%,-50%)';},{passive:true});
spatialQuality?.addEventListener('click',cycleSpatialQuality);
spatialCamera?.addEventListener('click',toggleSpatialCamera);
agentMeshClose?.addEventListener('click',()=>agentMeshView?.hide());
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(spatialLife.raf);spatialLife.raf=0}else if(spatialLife.running&&!spatialLife.raf)spatialLife.raf=requestAnimationFrame(spatialLoop)});

window.addEventListener('pagehide',()=>{spatialPresence.destroy();agentMeshView?.destroy()},{once:true});

modeToggle.addEventListener('click', () => {
  const next = shell.dataset.mode === 'pink-only' ? 'command-center' : 'pink-only';
  shell.dataset.mode = next; modeToggle.textContent = next === 'pink-only' ? 'Command Center' : 'Pink Only';
});

runtime.restoreSatellite().finally(() => { renderHealth(); if (currentView === 'satellite') renderDashboard('satellite'); });
renderHealth(); renderTasks(); renderDashboard();
