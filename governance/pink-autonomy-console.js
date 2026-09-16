// Pink Autonomy Console V1.1 — N0..N5 operational envelope + visible governance/evolution approvals.
(() => {
  'use strict';

  const VERSION = '1.1.0';
  const STORAGE_KEY = 'pink_autonomy_level_v1';
  const DEFAULT_LEVEL = 2;
  const LEVELS = Object.freeze([
    { level: 0, name: 'Somente conversa', short: 'CHAT', description: 'Responde e conversa. Não executa ferramentas, leituras externas ou mutações.', risks: [] },
    { level: 1, name: 'Leitura e pesquisa', short: 'READ', description: 'Permite consultas, memória, pesquisa e ferramentas somente leitura.', risks: ['READ_ONLY'] },
    { level: 2, name: 'Ações reversíveis', short: 'SAFE', description: 'Inclui sandbox, preview, blueprints e alterações locais com rollback determinístico.', risks: ['READ_ONLY', 'REVERSIBLE'] },
    { level: 3, name: 'Branches e PRs', short: 'WRITE', description: 'Permite escrita externa controlada, branches e Pull Requests. Approval Gate continua obrigatório.', risks: ['READ_ONLY', 'REVERSIBLE', 'EXTERNAL_WRITE'] },
    { level: 4, name: 'Deploy com aprovação', short: 'PROD', description: 'Permite ações de produção somente com aprovação explícita e evidências de teste.', risks: ['READ_ONLY', 'REVERSIBLE', 'EXTERNAL_WRITE', 'PRODUCTION'] },
    { level: 5, name: 'Admin crítico', short: 'ADMIN', description: 'Inclui ações destrutivas críticas. Nunca remove Approval Gate; destrutivas exigem confirmação reforçada.', risks: ['READ_ONLY', 'REVERSIBLE', 'EXTERNAL_WRITE', 'PRODUCTION', 'DESTRUCTIVE'] },
  ]);

  const state = { level: readLevel(), installed: false, wrappedApproval: false, originalCanExecute: null, lastRefreshAt: null };

  function readLevel() {
    try {
      const raw = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isInteger(raw) && raw >= 0 && raw <= 5 ? raw : DEFAULT_LEVEL;
    } catch (_) { return DEFAULT_LEVEL; }
  }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function levelMeta(level = state.level) { return LEVELS.find(item => item.level === Number(level)) || LEVELS[DEFAULT_LEVEL]; }
  function normalizeRisk(value) { return String(value || 'READ_ONLY').toUpperCase(); }
  function pct(value, fallback = 0) { const n = Number(value); return `${Math.round((Number.isFinite(n) ? n : fallback) * 100)}%`; }

  function policyFor(action = {}, level = state.level) {
    const meta = levelMeta(level);
    const risk = normalizeRisk(action.risk);
    const allowedByLevel = meta.risks.includes(risk);
    const destructive = risk === 'DESTRUCTIVE';
    return {
      version: VERSION,
      level: meta.level,
      levelName: meta.name,
      risk,
      allowedByLevel,
      destructive,
      production: risk === 'PRODUCTION',
      requiresReinforcedApproval: destructive && level >= 5,
      reason: allowedByLevel ? 'allowed-by-autonomy-level' : `risk-${risk.toLowerCase()}-blocked-at-n${meta.level}`,
    };
  }

  function evaluate(action = {}, approval = null) {
    const policy = policyFor(action);
    if (!policy.allowedByLevel) return { allowed: false, reason: 'autonomy-level-blocked', policy };
    if (policy.requiresReinforcedApproval && !(approval?.approved === true && approval?.secondApproved === true)) {
      return { allowed: false, reason: 'reinforced-approval-required', policy };
    }
    return { allowed: true, reason: 'autonomy-level-allows', policy };
  }

  function wrapApprovalEngine() {
    const approval = window.PinkFoundation?.approval;
    if (!approval || state.wrappedApproval || typeof approval.canExecute !== 'function') return false;
    const original = approval.canExecute.bind(approval);
    state.originalCanExecute = original;
    approval.canExecute = function pinkAutonomyAwareCanExecute(action = {}, token = null) {
      const autonomy = evaluate(action, token);
      const assessment = typeof approval.assess === 'function' ? approval.assess(action) : { risk: normalizeRisk(action.risk) };
      if (!autonomy.allowed) return Object.freeze({ allowed: false, assessment, reason: autonomy.reason, autonomy: autonomy.policy });
      const base = original(action, token);
      return Object.freeze({ ...base, autonomy: autonomy.policy });
    };
    state.wrappedApproval = true;
    return true;
  }

  function setLevel(next, source = 'ui') {
    const level = Number(next);
    if (!Number.isInteger(level) || level < 0 || level > 5) throw new Error('invalid_autonomy_level');
    const previous = state.level;
    state.level = level;
    try { localStorage.setItem(STORAGE_KEY, String(level)); } catch (_) {}
    window.PinkEvolution?.recordSession?.(`autonomy:N${previous}->N${level}`);
    window.dispatchEvent(new CustomEvent('pinkautonomy:change', { detail: snapshot() }));
    renderBadge();
    renderConsole();
    return snapshot();
  }

  function getTools() { try { return window.PinkTools?.snapshot?.().tools || []; } catch (_) { return []; } }
  function getAgents() {
    const agents = [];
    let providerSnapshot = null;
    try { providerSnapshot = window.PinkMultiAgent?.snapshot?.() || null; } catch (_) {}
    const providers = providerSnapshot?.providers || providerSnapshot?.registry || [];
    if (Array.isArray(providers)) {
      for (const provider of providers) agents.push({ name: provider.name || provider.id || provider.provider || 'provider', role: provider.role || provider.capabilities?.join?.(', ') || 'Modelo / agente', status: provider.status || provider.health || (provider.available === false ? 'unavailable' : 'registered') });
    } else if (providers && typeof providers === 'object') {
      for (const [name, provider] of Object.entries(providers)) agents.push({ name, role: provider?.role || provider?.capabilities?.join?.(', ') || 'Modelo / agente', status: provider?.status || provider?.health || 'registered' });
    }
    const runtimeAgents = [
      ['Pink Supervisor', 'Orquestra conversa, contexto e roteamento', Boolean(window.PinkSupervisorVoice || window.PinkAIGateway)],
      ['Pink Memory', 'Memória persistente e contexto', Boolean(window.PinkMemoryCloud || window.PinkMemoryCore)],
      ['Pink Studio', 'Engenharia, planejamento e execução controlada', Boolean(window.PinkStudio)],
      ['Pink Evolution', 'Observa, prioriza e experimenta melhorias', Boolean(window.PinkAutonomousEvolution)],
      ['Pink Tools', 'Registro de ferramentas LPS', Boolean(window.PinkTools)],
      ['Pink Companion', 'Ponte local capability-scoped', Boolean(window.PinkCompanion)],
    ];
    for (const [name, role, available] of runtimeAgents) if (!agents.some(item => String(item.name).toLowerCase() === String(name).toLowerCase())) agents.push({ name, role, status: available ? 'active' : 'standby' });
    return agents;
  }
  function getEvolution() {
    try { return { autonomous: window.PinkAutonomousEvolution?.snapshot?.() || null, legacy: window.PinkEvolution?.exportReviewPacket?.() || null }; }
    catch (_) { return { autonomous: null, legacy: null }; }
  }
  function getLedger() { try { return window.PinkFoundation?.ledger?.list?.() || []; } catch (_) { return []; } }
  function getConnections() {
    const cfg = window.PinkPublicConfig || {};
    return { environment: cfg.environment || 'unknown', supervisor: cfg.ai?.supervisor || 'unknown', fallbacks: cfg.ai?.fallbacks || [], memory: cfg.ai?.memory || 'unknown', voice: cfg.voice?.provider || 'unknown', supabase: Boolean(cfg.supabase?.url), tools: getTools() };
  }
  function snapshot() { return { version: VERSION, level: state.level, levelMeta: clone(levelMeta()), wrappedApproval: state.wrappedApproval, policy: 'AUTONOMY_ENVELOPE_PLUS_APPROVAL_GATE', connections: getConnections() }; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

  function ensureStyles() {
    if (document.getElementById('pink-autonomy-styles')) return;
    const style = document.createElement('style');
    style.id = 'pink-autonomy-styles';
    style.textContent = `#pinkAutonomyBtn{position:relative;display:inline-flex;align-items:center;gap:.4rem;border:1px solid rgba(34,211,238,.28);background:rgba(6,18,31,.72);color:#cffafe;border-radius:999px;padding:.48rem .7rem;font:700 11px/1 Inter,sans-serif;cursor:pointer;box-shadow:0 0 20px rgba(6,182,212,.08)}#pinkAutonomyBtn:hover{border-color:rgba(236,72,153,.55);color:#fbcfe8}#pinkAutonomyBtn i{width:7px;height:7px;border-radius:50%;background:#22d3ee;box-shadow:0 0 10px #22d3ee}.pink-autonomy-overlay{position:fixed;inset:0;z-index:9998;background:rgba(1,5,12,.82);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px}.pink-autonomy-modal{width:min(1040px,96vw);max-height:90vh;overflow:hidden;background:linear-gradient(155deg,rgba(9,17,30,.98),rgba(9,5,20,.98));border:1px solid rgba(34,211,238,.25);border-radius:20px;box-shadow:0 25px 100px rgba(0,0,0,.55),0 0 55px rgba(236,72,153,.08);color:#e2e8f0;font-family:Inter,sans-serif}.pink-autonomy-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.13)}.pink-autonomy-head h2{margin:3px 0 0;font-size:18px}.pink-autonomy-head small{color:#67e8f9;letter-spacing:.14em;font-weight:800}.pink-autonomy-close{border:1px solid rgba(148,163,184,.2);background:#0f172a;color:#cbd5e1;border-radius:10px;padding:7px 10px;cursor:pointer}.pink-autonomy-tabs{display:flex;gap:7px;padding:10px 16px;border-bottom:1px solid rgba(148,163,184,.12);overflow:auto}.pink-autonomy-tabs button{white-space:nowrap;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.7);color:#94a3b8;padding:8px 11px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer}.pink-autonomy-tabs button.active{color:#fff;border-color:rgba(236,72,153,.45);background:rgba(236,72,153,.12)}.pink-autonomy-body{padding:18px;overflow:auto;max-height:70vh}.pink-autonomy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pink-level-card{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.55);border-radius:14px;padding:13px;cursor:pointer}.pink-level-card.active{border-color:rgba(34,211,238,.65);background:rgba(8,145,178,.1);box-shadow:0 0 24px rgba(34,211,238,.08)}.pink-level-card strong{display:block;color:#f8fafc;margin-bottom:5px}.pink-level-card p{margin:0;color:#94a3b8;font-size:12px;line-height:1.45}.pink-kpi-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:14px}.pink-kpi{padding:12px;border-radius:12px;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.12)}.pink-kpi small{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.09em}.pink-kpi strong{display:block;margin-top:5px;font-size:15px}.pink-list{display:grid;gap:8px}.pink-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:11px 12px;border-radius:12px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.1)}.pink-row p{margin:3px 0 0;color:#94a3b8;font-size:11px;line-height:1.4}.pink-chip{white-space:nowrap;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900;text-transform:uppercase;border:1px solid rgba(148,163,184,.18);color:#cbd5e1}.pink-chip.good{color:#86efac;border-color:rgba(74,222,128,.28);background:rgba(22,101,52,.15)}.pink-chip.warn{color:#fde68a;border-color:rgba(250,204,21,.25);background:rgba(113,63,18,.12)}.pink-autonomy-note{padding:12px;border:1px solid rgba(236,72,153,.25);background:rgba(131,24,67,.12);border-radius:12px;color:#fbcfe8;font-size:12px;line-height:1.5;margin-bottom:12px}.pink-autonomy-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.pink-autonomy-actions button,.pink-evolution-approve{border:1px solid rgba(34,211,238,.25);background:rgba(8,145,178,.12);color:#cffafe;padding:8px 11px;border-radius:10px;font-weight:800;cursor:pointer}.pink-evolution-approve{border-color:rgba(74,222,128,.4);background:rgba(22,101,52,.22);color:#bbf7d0}.pink-evolution-approve:disabled{opacity:.55;cursor:default}.pink-evolution-card{padding:14px;border-radius:14px;background:linear-gradient(145deg,rgba(15,23,42,.72),rgba(12,8,25,.7));border:1px solid rgba(148,163,184,.13)}.pink-evolution-card.approved{border-color:rgba(74,222,128,.32);box-shadow:0 0 24px rgba(34,197,94,.06)}.pink-evolution-head,.pink-evolution-foot{display:flex;gap:10px;align-items:center;justify-content:space-between}.pink-evolution-head strong{font-size:13px;color:#f8fafc}.pink-evolution-evidence{margin:9px 0;color:#94a3b8;font-size:11px;line-height:1.5}.pink-evolution-meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.pink-evolution-meta span{font-size:9px;font-weight:800;border-radius:999px;padding:4px 7px;border:1px solid rgba(148,163,184,.16);color:#cbd5e1;background:rgba(15,23,42,.65)}.pink-evolution-foot{margin-top:10px}.pink-evolution-foot small{color:#64748b;font-size:10px;line-height:1.35}.pink-evolution-empty{padding:16px;border-radius:14px;border:1px dashed rgba(148,163,184,.2);color:#94a3b8;font-size:12px}@media(max-width:720px){.pink-autonomy-grid,.pink-kpi-row{grid-template-columns:1fr}.pink-autonomy-overlay{padding:8px}.pink-autonomy-modal{max-height:96vh}.pink-autonomy-body{max-height:75vh}.pink-evolution-head,.pink-evolution-foot{align-items:flex-start;flex-direction:column}.pink-evolution-approve{width:100%}}`;
    document.head.appendChild(style);
  }

  function ensureUi() {
    ensureStyles();
    if (!document.getElementById('pinkAutonomyBtn')) {
      const button = document.createElement('button'); button.type = 'button'; button.id = 'pinkAutonomyBtn'; button.title = 'Autonomia, agentes, conexões, evolução e auditoria'; button.addEventListener('click', openConsole);
      const actions = document.querySelector('.top-actions') || document.body; const settings = document.getElementById('settingsBtn');
      if (settings?.parentNode === actions) actions.insertBefore(button, settings); else actions.appendChild(button);
    }
    if (!document.getElementById('pinkAutonomyOverlay')) {
      const overlay = document.createElement('div'); overlay.id = 'pinkAutonomyOverlay'; overlay.className = 'pink-autonomy-overlay'; overlay.hidden = true;
      overlay.innerHTML = `<section class="pink-autonomy-modal" role="dialog" aria-modal="true" aria-labelledby="pinkAutonomyTitle"><header class="pink-autonomy-head"><div><small>PINK LPS · GOVERNANCE CORE</small><h2 id="pinkAutonomyTitle">Autonomia & Autoevolução</h2></div><button type="button" class="pink-autonomy-close" data-pink-close>✕</button></header><nav class="pink-autonomy-tabs"><button data-pink-tab="autonomy" class="active">Níveis N0–N5</button><button data-pink-tab="evolution">Autoevolução</button><button data-pink-tab="agents">Agentes</button><button data-pink-tab="connections">Conexões</button><button data-pink-tab="ledger">Run Ledger</button></nav><div id="pinkAutonomyBody" class="pink-autonomy-body"></div></section>`;
      overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-pink-close]')) closeConsole(); });
      overlay.querySelectorAll('[data-pink-tab]').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.pinkTab)));
      document.body.appendChild(overlay);
    }
    renderBadge();
  }

  let currentTab = 'autonomy';
  function selectTab(tab) { currentTab = tab || 'autonomy'; document.querySelectorAll('[data-pink-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.pinkTab === currentTab)); renderConsole(); }
  function renderBadge() { const button = document.getElementById('pinkAutonomyBtn'); if (!button) return; const meta = levelMeta(); button.innerHTML = `<i></i><span>N${meta.level} · ${escapeHtml(meta.short)}</span>`; }
  async function approveEvolutionCandidate(id, button) {
    if (!id) return;
    if (button) { button.disabled = true; button.textContent = 'Registrando acordo…'; }
    try {
      const api = window.PinkAutonomousEvolution;
      if (!api?.approve) throw new Error('evolution_approval_api_unavailable');
      await Promise.resolve(api.approve(id, { source: 'governance-console' }));
      window.PinkEvolution?.recordSession?.(`evolution-approved:${id}`);
      renderConsole();
    } catch (error) {
      window.PinkEvolution?.recordIssue?.('evolution-approval-ui', error?.message || error);
      if (button) { button.disabled = false; button.textContent = 'Tentar novamente'; }
    }
  }
  function renderConsole() {
    const body = document.getElementById('pinkAutonomyBody'); if (!body) return; state.lastRefreshAt = new Date().toISOString();
    if (currentTab === 'autonomy') body.innerHTML = renderAutonomy(); else if (currentTab === 'evolution') body.innerHTML = renderEvolution(); else if (currentTab === 'agents') body.innerHTML = renderAgents(); else if (currentTab === 'connections') body.innerHTML = renderConnections(); else if (currentTab === 'ledger') body.innerHTML = renderLedger();
    body.querySelectorAll('[data-pink-level]').forEach(card => card.addEventListener('click', () => setLevel(Number(card.dataset.pinkLevel), 'governance-console')));
    body.querySelectorAll('[data-pink-approve-evolution]').forEach(button => button.addEventListener('click', () => approveEvolutionCandidate(button.dataset.pinkApproveEvolution, button)));
    body.querySelector('[data-pink-refresh]')?.addEventListener('click', renderConsole);
    body.querySelector('[data-pink-export]')?.addEventListener('click', async () => { const packet = { autonomy: snapshot(), evolution: getEvolution(), ledger: getLedger().slice(-30) }; try { await navigator.clipboard.writeText(JSON.stringify(packet, null, 2)); } catch (_) {} });
  }
  function renderAutonomy() { const meta = levelMeta(); return `<div class="pink-autonomy-note"><strong>N${meta.level} ativo — ${escapeHtml(meta.name)}.</strong> O nível define o máximo que a Pink pode tentar executar. O Approval Gate continua obrigatório para escrita externa, produção e ações críticas.</div><div class="pink-autonomy-grid">${LEVELS.map(item => `<article class="pink-level-card ${item.level === state.level ? 'active' : ''}" data-pink-level="${item.level}"><strong>N${item.level} · ${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></article>`).join('')}</div>`; }
  function renderEvolution() {
    const { autonomous, legacy } = getEvolution();
    const candidates = autonomous?.candidates || legacy?.openCandidates || [];
    const experiments = autonomous?.experiments || [];
    const approved = candidates.filter(c => c.approvedForEvolution === true || c.status === 'approved_for_evolution').length;
    const waiting = candidates.filter(c => !(c.approvedForEvolution === true || c.status === 'approved_for_evolution')).length;
    const cards = candidates.length ? candidates.slice(0, 12).map(c => {
      const isApproved = c.approvedForEvolution === true || c.status === 'approved_for_evolution';
      const evidence = Array.isArray(c.evidence) ? c.evidence.join(' · ') : (c.evidence || 'Sem evidência detalhada disponível.');
      const status = isApproved ? 'Aprovado para evolução' : 'Aguardando seu acordo';
      return `<article class="pink-evolution-card ${isApproved ? 'approved' : ''}"><div class="pink-evolution-head"><strong>${escapeHtml(c.title || c.kind || 'Melhoria')}</strong><span class="pink-chip ${isApproved ? 'good' : 'warn'}">${escapeHtml(status)}</span></div><p class="pink-evolution-evidence"><b>Por que evoluir:</b> ${escapeHtml(evidence)}</p><div class="pink-evolution-meta"><span>Impacto ${pct(c.impact,.6)}</span><span>Confiança ${pct(c.confidence,.7)}</span><span>Risco ${pct(c.risk,.25)}</span><span>Score ${pct(c.score,.5)}</span><span>${escapeHtml(c.kind || 'improvement')}</span></div><div class="pink-evolution-foot"><small>${isApproved ? `Acordo registrado${c.approvedAt ? ` · ${escapeHtml(new Date(c.approvedAt).toLocaleString('pt-BR'))}` : ''}. A Pink pode investigar, codificar, testar e abrir Draft PR. Publicação continua bloqueada.` : 'Ao dar de acordo, você autoriza somente a evolução em branch isolada + testes + Draft PR. Isso NÃO autoriza merge nem publicação.'}</small>${isApproved ? '<button class="pink-evolution-approve" type="button" disabled>✓ De acordo</button>' : `<button class="pink-evolution-approve" type="button" data-pink-approve-evolution="${escapeHtml(c.id || '')}">Dar de acordo</button>`}</div></article>`;
    }).join('') : '<div class="pink-evolution-empty"><strong>Nenhum candidato aberto.</strong><br>A Pink continuará observando erros, correções e falhas de uso para propor evoluções com evidência.</div>';
    return `<div class="pink-kpi-row"><div class="pink-kpi"><small>Aguardando acordo</small><strong>${waiting}</strong></div><div class="pink-kpi"><small>Aprovados</small><strong>${approved}</strong></div><div class="pink-kpi"><small>Experimentos</small><strong>${experiments.length}</strong></div><div class="pink-kpi"><small>Auto-publicação</small><strong>Bloqueada</strong></div></div><div class="pink-autonomy-note"><strong>Você controla a fila.</strong> A Pink mostra o que precisa evoluir e a evidência. Só depois do seu <b>Dar de acordo</b> o N5/ChatGPT pode trabalhar naquele candidato. Merge e produção continuam exigindo aprovação separada.</div><div class="pink-list">${cards}</div><div class="pink-autonomy-actions"><button data-pink-export>Copiar pacote de evolução</button><button data-pink-refresh>Atualizar diagnóstico</button></div>`;
  }
  function renderAgents() { const agents = getAgents(); return `<div class="pink-kpi-row"><div class="pink-kpi"><small>Agentes/motores</small><strong>${agents.length}</strong></div><div class="pink-kpi"><small>Coordenação</small><strong>Pink</strong></div><div class="pink-kpi"><small>Política</small><strong>No evidence → no claim</strong></div><div class="pink-kpi"><small>Autonomia</small><strong>N${state.level}</strong></div></div><div class="pink-list">${agents.map(agent => `<div class="pink-row"><div><strong>${escapeHtml(agent.name)}</strong><p>${escapeHtml(agent.role)}</p></div><span class="pink-chip ${/active|healthy|online|registered/i.test(agent.status) ? 'good' : 'warn'}">${escapeHtml(agent.status)}</span></div>`).join('')}</div>`; }
  function renderConnections() { const c = getConnections(); const toolRows = (c.tools || []).map(tool => `<div class="pink-row"><div><strong>${escapeHtml(tool.name)}</strong><p>${escapeHtml((tool.capabilities || []).join(' · '))}</p></div><span class="pink-chip ${tool.health === 'healthy' ? 'good' : 'warn'}">${escapeHtml(`${tool.risk} · ${tool.auth}`)}</span></div>`).join(''); return `<div class="pink-kpi-row"><div class="pink-kpi"><small>Ambiente</small><strong>${escapeHtml(c.environment)}</strong></div><div class="pink-kpi"><small>Supervisor</small><strong>${escapeHtml(c.supervisor)}</strong></div><div class="pink-kpi"><small>Memória</small><strong>${escapeHtml(c.memory)}</strong></div><div class="pink-kpi"><small>Ferramentas</small><strong>${c.tools.length}</strong></div></div><div class="pink-autonomy-note">Fallbacks configurados: ${escapeHtml((c.fallbacks || []).join(' → ') || 'nenhum')}. Supabase público: ${c.supabase ? 'configurado' : 'não configurado'}.</div><div class="pink-list">${toolRows || '<div class="pink-row"><div><strong>Tool Registry ainda carregando</strong><p>Atualize o diagnóstico após o boot completo da plataforma.</p></div><span class="pink-chip warn">standby</span></div>'}</div><div class="pink-autonomy-actions"><button data-pink-refresh>Atualizar conexões</button></div>`; }
  function renderLedger() { const all = getLedger(); const ledger = all.slice(-30).reverse(); let integrity = 'OK'; try { if (window.PinkFoundation?.health?.().ledgerConsistent === false) integrity = 'Falha'; } catch (_) {} return `<div class="pink-kpi-row"><div class="pink-kpi"><small>Execuções registradas</small><strong>${all.length}</strong></div><div class="pink-kpi"><small>Integridade</small><strong>${integrity}</strong></div><div class="pink-kpi"><small>Approval Engine</small><strong>${state.wrappedApproval ? 'N0–N5 ativo' : 'base'}</strong></div><div class="pink-kpi"><small>Nível atual</small><strong>N${state.level}</strong></div></div><div class="pink-list">${ledger.length ? ledger.map(run => `<div class="pink-row"><div><strong>${escapeHtml(run.task || run.id)}</strong><p>${escapeHtml(`${run.risk || 'READ_ONLY'} · ${run.status || 'unknown'} · evidências ${(run.evidence || []).length}`)}</p></div><span class="pink-chip ${run.status === 'completed' ? 'good' : 'warn'}">${escapeHtml(run.status)}</span></div>`).join('') : '<div class="pink-row"><div><strong>Sem execuções nesta sessão</strong><p>O Run Ledger registrará as ações controladas da Pink.</p></div><span class="pink-chip good">pronto</span></div>'}</div><div class="pink-autonomy-actions"><button data-pink-refresh>Atualizar ledger</button></div>`; }
  function openConsole(tab = 'autonomy') { ensureUi(); const overlay = document.getElementById('pinkAutonomyOverlay'); if (!overlay) return; overlay.hidden = false; selectTab(tab); window.PinkEvolution?.recordSession?.('open-autonomy-console'); }
  function closeConsole() { const overlay = document.getElementById('pinkAutonomyOverlay'); if (overlay) overlay.hidden = true; }
  function install() { if (state.installed) return snapshot(); wrapApprovalEngine(); ensureUi(); state.installed = true; window.addEventListener('pinkfoundation:ready', wrapApprovalEngine); window.addEventListener('pinkplatform:ready', () => { renderBadge(); if (!document.getElementById('pinkAutonomyOverlay')?.hidden) renderConsole(); }); window.addEventListener('pinkevolution:candidate', () => { if (currentTab === 'evolution' && !document.getElementById('pinkAutonomyOverlay')?.hidden) renderConsole(); }); window.addEventListener('pinkevolution:approved', () => { if (currentTab === 'evolution' && !document.getElementById('pinkAutonomyOverlay')?.hidden) renderConsole(); }); window.dispatchEvent(new CustomEvent('pinkautonomy:ready', { detail: snapshot() })); return snapshot(); }

  window.PinkAutonomy = { version: VERSION, levels: clone(LEVELS), getLevel: () => state.level, setLevel, evaluate, policyFor, snapshot, open: openConsole, close: closeConsole, install };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else queueMicrotask(install);
})();
