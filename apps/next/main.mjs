import { createPinkNextRuntime } from '../../packages/next-runtime/index.mjs';
import { MemoryLayer } from '../../packages/contracts/index.mjs';

const config = globalThis.PinkPublicConfig || {};
const runtime = createPinkNextRuntime({ config, storage: globalThis.localStorage });
globalThis.PinkNext = runtime;

const $ = (s) => document.querySelector(s);
const dashboard = $('#dashboard');
const taskList = $('#task-list');
const prompt = $('#prompt');
const shell = $('.app-shell');
const health = $('#health-strip');
const modeToggle = $('#mode-toggle');
const productionCloudAllowed = location.origin === 'https://ricardoprf.github.io';
let lastReply = '';
let lastProvider = '';

function chip(label, ok = true) { return `<span class="chip ${ok ? 'ok' : ''}">${label}</span>`; }
function badge(state) { const ok = ['available','completed','running'].includes(state); return `<span class="badge ${ok ? 'ok' : 'warn'}">${state}</span>`; }

function renderHealth() {
  const caps = runtime.tools.list();
  const available = caps.filter((c) => c.state === 'available').length;
  health.innerHTML = [chip('NEXT runtime'), chip(`${available}/${caps.length} capabilities`, available > 0), chip(runtime.cloud.configured ? 'Cloud adapters' : 'Cloud offline', runtime.cloud.configured), chip('Approval Gate'), chip('Legacy safe')].join('');
}

function renderTasks() {
  const tasks = runtime.taskRuntime.list().slice().reverse();
  taskList.innerHTML = tasks.length ? tasks.slice(0,8).map((t) => `<article class="task-card"><strong>${escapeHtml(t.goal)}</strong><small>${t.status} · etapa ${Math.min(t.currentStep + 1, Math.max(1,t.plan.length))}/${Math.max(1,t.plan.length)}</small></article>`).join('') : '<div class="metric-sub">Nenhuma tarefa criada nesta instalação.</div>';
}

function replyPanel() {
  if (!lastReply) return '<article class="panel"><h2>Pink</h2><p class="metric-sub">O cérebro existente será acessado por adapter apenas em produção. Testes locais não escrevem nem chamam provedores.</p></article>';
  return `<article class="panel"><h2>Pink · ${escapeHtml(lastProvider || 'brain')}</h2><p class="assistant-reply">${escapeHtml(lastReply)}</p></article>`;
}

function renderDashboard(view = 'home') {
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
      <article class="panel"><h2>Security</h2><div class="metric">HOST</div><div class="metric-sub">constraints e approvals são avaliados fora do modelo</div></article>
      <article class="panel"><h2>Evolution</h2><div class="metric">${evo.length}</div><div class="metric-sub">candidatos · código exige acordo humano + baseline</div></article>
      ${replyPanel()}`,
    tasks: `<article class="panel"><h2>Tarefas</h2><div class="list">${taskRows}</div></article><article class="panel"><h2>Continuação</h2><p class="metric-sub">Checkpoint, pause e resume pertencem ao Task Runtime — não ao histórico do chat.</p></article>${replyPanel()}`,
    memory: `<article class="panel"><h2>Memory V2</h2><div class="list">${Object.values(MemoryLayer).map((x)=>`<div class="row"><span>${x}</span><span class="badge">layer</span></div>`).join('')}</div></article><article class="panel"><h2>Context Compiler</h2><p class="metric-sub">A memória relevante é compilada de forma limitada. Evidência bruta permanece separada para drill-down.</p></article>`,
    skills: `<article class="panel"><h2>Skills</h2><div class="metric">${snapshot.skills.length}</div><div class="metric-sub">procedimentos reutilizáveis registrados</div></article><article class="panel"><h2>Tool Search</h2><p class="metric-sub">Capabilities são descobertas progressivamente; o cérebro não recebe o catálogo inteiro em todo turno.</p></article>`,
    evolution: `<article class="panel"><h2>Autoevolução 2.0</h2><p class="metric-sub">Observe → trace → candidate → Dar de acordo → baseline → implementação → evals → A/B → Draft PR.</p></article><article class="panel"><h2>Gate</h2><div class="metric">HUMAN</div><div class="metric-sub">sem acordo: sem alteração de código. Sem aprovação final: sem produção.</div></article>`,
    security: `<article class="panel"><h2>Constraint Register</h2><div class="list"><div class="row"><span>Merge main automático</span><span class="badge warn">DENY</span></div><div class="row"><span>Publicação automática</span><span class="badge warn">DENY</span></div><div class="row"><span>Expor secrets</span><span class="badge warn">DENY</span></div><div class="row"><span>Enfraquecer auth/RLS</span><span class="badge warn">DENY</span></div></div></article><article class="panel"><h2>Trust Boundary</h2><p class="metric-sub">Conteúdo de web/MCP/tools é dado não confiável. O risco final é calculado pelo host.</p></article>`
  };
  dashboard.innerHTML = panels[view] || panels.home;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

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

modeToggle.addEventListener('click', () => {
  const next = shell.dataset.mode === 'pink-only' ? 'command-center' : 'pink-only';
  shell.dataset.mode = next; modeToggle.textContent = next === 'pink-only' ? 'Command Center' : 'Pink Only';
});

renderHealth(); renderTasks(); renderDashboard();
