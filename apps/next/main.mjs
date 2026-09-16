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

function chip(label, ok = true) { return `<span class="chip ${ok ? 'ok' : ''}">${label}</span>`; }
function badge(state) { const ok = ['available','completed','running'].includes(state); return `<span class="badge ${ok ? 'ok' : 'warn'}">${state}</span>`; }

function renderHealth() {
  const caps = runtime.tools.list();
  const available = caps.filter((c) => c.state === 'available').length;
  health.innerHTML = [chip('NEXT runtime'), chip(`${available}/${caps.length} capabilities`, available > 0), chip('Approval Gate'), chip('Legacy safe')].join('');
}

function renderTasks() {
  const tasks = runtime.taskRuntime.list().slice().reverse();
  taskList.innerHTML = tasks.length ? tasks.slice(0,8).map((t) => `<article class="task-card"><strong>${escapeHtml(t.goal)}</strong><small>${t.status} · etapa ${Math.min(t.currentStep + 1, Math.max(1,t.plan.length))}/${Math.max(1,t.plan.length)}</small></article>`).join('') : '<div class="metric-sub">Nenhuma tarefa criada nesta instalação.</div>';
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
      <article class="panel"><h2>Evolution</h2><div class="metric">${evo.length}</div><div class="metric-sub">candidatos · código exige acordo humano + baseline</div></article>`,
    tasks: `<article class="panel"><h2>Tarefas</h2><div class="list">${taskRows}</div></article><article class="panel"><h2>Continuação</h2><p class="metric-sub">Checkpoint, pause e resume pertencem ao Task Runtime — não ao histórico do chat.</p></article>`,
    memory: `<article class="panel"><h2>Memory V2</h2><div class="list">${Object.values(MemoryLayer).map((x)=>`<div class="row"><span>${x}</span><span class="badge">layer</span></div>`).join('')}</div></article><article class="panel"><h2>Context Compiler</h2><p class="metric-sub">A memória relevante é compilada de forma limitada. Evidência bruta permanece separada para drill-down.</p></article>`,
    skills: `<article class="panel"><h2>Skills</h2><div class="metric">${snapshot.skills.length}</div><div class="metric-sub">procedimentos reutilizáveis registrados</div></article><article class="panel"><h2>Tool Search</h2><p class="metric-sub">Capabilities são descobertas progressivamente; o cérebro não recebe o catálogo inteiro em todo turno.</p></article>`,
    evolution: `<article class="panel"><h2>Autoevolução 2.0</h2><p class="metric-sub">Observe → trace → candidate → Dar de acordo → baseline → implementação → evals → A/B → Draft PR.</p></article><article class="panel"><h2>Gate</h2><div class="metric">HUMAN</div><div class="metric-sub">sem acordo: sem alteração de código. Sem aprovação final: sem produção.</div></article>`,
    security: `<article class="panel"><h2>Constraint Register</h2><div class="list"><div class="row"><span>Merge main automático</span><span class="badge warn">DENY</span></div><div class="row"><span>Publicação automática</span><span class="badge warn">DENY</span></div><div class="row"><span>Expor secrets</span><span class="badge warn">DENY</span></div><div class="row"><span>Enfraquecer auth/RLS</span><span class="badge warn">DENY</span></div></div></article><article class="panel"><h2>Trust Boundary</h2><p class="metric-sub">Conteúdo de web/MCP/tools é dado não confiável. O risco final é calculado pelo host.</p></article>`
  };
  dashboard.innerHTML = panels[view] || panels.home;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function createTaskFromPrompt() {
  const goal = prompt.value.trim(); if (!goal) return;
  const task = runtime.supervisor.createTask(goal, { source: 'command-center' });
  runtime.taskRuntime.start(task.id);
  runtime.memory.remember({ layer: MemoryLayer.WORKING, type: 'task', text: goal, source: 'command-center', importance: .65 });
  prompt.value = ''; renderTasks(); renderDashboard('tasks');
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === 'tasks'));
}

$('#send').addEventListener('click', createTaskFromPrompt);
prompt.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); createTaskFromPrompt(); } });

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active')); button.classList.add('active'); renderDashboard(button.dataset.view);
}));

modeToggle.addEventListener('click', () => {
  const next = shell.dataset.mode === 'pink-only' ? 'command-center' : 'pink-only';
  shell.dataset.mode = next; modeToggle.textContent = next === 'pink-only' ? 'Command Center' : 'Pink Only';
});

renderHealth(); renderTasks(); renderDashboard();
