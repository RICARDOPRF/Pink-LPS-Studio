// Pink Phase 3.4.2 — contextual holographic interface and screen modes.
// Uses only context that is already open/known by Pink; never fabricates project metrics.
(() => {
  const stage = document.querySelector('#pinkStage');
  const workspace = document.querySelector('.workspace');
  const preview = document.querySelector('#previewArea');
  if (!stage || !workspace || window.PinkHolographicUI) return;

  const MODES = new Set(['pink-only', 'pink-screen', 'presentation']);
  let mode = 'pink-only';
  let context = null;
  let destroyed = false;

  const hud = document.createElement('div');
  hud.className = 'pink-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = `
    <div class="pink-hud-corner pink-hud-corner-tl"></div>
    <div class="pink-hud-corner pink-hud-corner-tr"></div>
    <div class="pink-hud-corner pink-hud-corner-bl"></div>
    <div class="pink-hud-corner pink-hud-corner-br"></div>
    <section class="pink-hud-card pink-hud-left">
      <small>PINK // LPS</small>
      <strong data-hud-state>PRONTA</strong>
      <span data-hud-mode>PINK ONLY</span>
    </section>
    <section class="pink-hud-card pink-hud-right">
      <small data-hud-context-type>SISTEMA</small>
      <strong data-hud-context-title>Pink LPS Studio</strong>
      <span data-hud-context-detail>Central operacional</span>
    </section>
    <div class="pink-hud-core">
      <span data-hud-voice>VOICE · ROBERTA</span>
      <i></i>
      <span data-hud-brain>BRAIN · NVIDIA</span>
      <i></i>
      <span data-hud-avatar>AVATAR · FALLBACK</span>
    </div>
  `;
  stage.appendChild(hud);

  const els = {
    state: hud.querySelector('[data-hud-state]'),
    mode: hud.querySelector('[data-hud-mode]'),
    type: hud.querySelector('[data-hud-context-type]'),
    title: hud.querySelector('[data-hud-context-title]'),
    detail: hud.querySelector('[data-hud-context-detail]'),
    voice: hud.querySelector('[data-hud-voice]'),
    brain: hud.querySelector('[data-hud-brain]'),
    avatar: hud.querySelector('[data-hud-avatar]')
  };

  const stateLabels = {
    idle: 'PRONTA', listening: 'OUVINDO', thinking: 'PENSANDO', speaking: 'FALANDO',
    executing: 'EXECUTANDO', reviewing: 'REVISANDO', presenting: 'APRESENTANDO',
    success: 'CONCLUÍDO', error: 'ATENÇÃO'
  };
  const modeLabels = {
    'pink-only': 'PINK ONLY',
    'pink-screen': 'PINK + SCREEN',
    presentation: 'PRESENTATION MODE'
  };

  function clean(value, fallback = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  function shortHost(value) {
    try { return new URL(String(value || ''), location.href).hostname.replace(/^www\./, ''); }
    catch (_) { return clean(value); }
  }

  function currentContext() {
    const panelFrame = preview?.querySelector('iframe[data-pink-panel]');
    if (panelFrame) {
      const active = window.PinkPanels?.active;
      return {
        type: 'PAINEL DE BORDO',
        id: clean(active?.id || panelFrame.dataset.pinkPanel, 'painel'),
        title: clean(active?.short || active?.name || panelFrame.title, 'Painel ativo'),
        url: clean(active?.url || panelFrame.src),
        detail: clean(active?.repo || shortHost(active?.url || panelFrame.src))
      };
    }

    const storeAdmin = preview?.querySelector('iframe[data-pink-store-admin]');
    if (storeAdmin) {
      const store = window.PinkStore?.store;
      return {
        type: 'E-COMMERCE · ADMIN', id: clean(store?.id, 'praia-movimento'),
        title: clean(store?.name, 'Praia & Movimento'), url: clean(store?.admin || storeAdmin.src),
        detail: clean(store?.repo || shortHost(store?.admin || storeAdmin.src))
      };
    }

    const storeFrame = preview?.querySelector('iframe[data-pink-store]');
    if (storeFrame) {
      const store = window.PinkStore?.store;
      return {
        type: 'E-COMMERCE', id: clean(store?.id, 'praia-movimento'),
        title: clean(store?.name || storeFrame.title, 'Praia & Movimento'), url: clean(store?.url || storeFrame.src),
        detail: clean(store?.repo || shortHost(store?.url || storeFrame.src))
      };
    }

    const projectFrame = preview?.querySelector('iframe[data-pink-project]');
    if (projectFrame) {
      const id = clean(projectFrame.dataset.pinkProject, 'project');
      const project = window.PinkCore?.projects?.find?.(item => item.id === id);
      return {
        type: 'SISTEMA LPS', id,
        title: clean(project?.name || projectFrame.title, 'Sistema ativo'), url: clean(project?.url || projectFrame.src),
        detail: clean(project?.repo || shortHost(project?.url || projectFrame.src))
      };
    }

    return null;
  }

  function avatarLabel() {
    const avatar = window.PinkAvatar3D?.snapshot?.();
    const registry = window.PinkAvatarRegistry?.snapshot?.();
    if (avatar?.model?.hasModel || /-model$/.test(String(avatar?.model?.mode || avatar?.mode || ''))) {
      const format = clean(stage.dataset.avatarFormat, '3D').toUpperCase();
      const version = clean(stage.dataset.avatarVersion);
      return `AVATAR · ${format}${version && version !== 'unknown' ? ` · ${version}` : ''}`;
    }
    if (registry?.status === 'loading-model') return 'AVATAR · CARREGANDO';
    return 'AVATAR · FALLBACK';
  }

  function voiceLabel() {
    const voiceMode = window.PinkVoice?.mode;
    if (voiceMode === 'fallback') return 'VOICE · CONTINGÊNCIA';
    if (voiceMode === 'elevenlabs') return 'VOICE · ROBERTA';
    return 'VOICE · READY';
  }

  function brainLabel() {
    const brain = window.PinkNVIDIA?.getStatus?.();
    if (brain?.status === 'online') return 'BRAIN · NVIDIA';
    if (brain?.status === 'thinking' || brain?.status === 'testing') return 'BRAIN · PROCESSANDO';
    if (brain?.status === 'error') return 'BRAIN · CONTINGÊNCIA';
    return 'BRAIN · READY';
  }

  function render() {
    if (destroyed) return;
    context = currentContext();
    const state = clean(stage.dataset.state, 'idle');
    els.state.textContent = stateLabels[state] || state.toUpperCase();
    els.mode.textContent = modeLabels[mode] || mode.toUpperCase();
    els.type.textContent = context?.type || 'SISTEMA';
    els.title.textContent = context?.title || 'Pink LPS Studio';
    els.detail.textContent = context?.detail || 'Central operacional';
    els.voice.textContent = voiceLabel();
    els.brain.textContent = brainLabel();
    els.avatar.textContent = avatarLabel();
    stage.dataset.hudContext = context?.id || 'pink';
  }

  function setMode(next, options = {}) {
    const requested = MODES.has(next) ? next : 'pink-only';
    if (requested === 'pink-screen' && !currentContext() && !options.force) return setMode('pink-only', { force: true });
    mode = requested;
    document.body.dataset.pinkMode = mode;
    workspace.dataset.pinkMode = mode;
    if (mode === 'presentation') stage.dataset.presentation = '1';
    else delete stage.dataset.presentation;
    render();
    window.dispatchEvent(new CustomEvent('pinkui:mode-change', { detail: { mode, context: context ? { ...context } : null } }));
    return mode;
  }

  function syncMode() {
    if (document.fullscreenElement?.classList?.contains('preview-card') || document.fullscreenElement?.closest?.('.preview-card')) {
      setMode('presentation', { force: true });
      return;
    }
    setMode(currentContext() ? 'pink-screen' : 'pink-only', { force: true });
  }

  function refresh() {
    syncMode();
    render();
    return snapshot();
  }

  function snapshot() {
    return {
      mode,
      state: stage.dataset.state || 'idle',
      context: context ? { ...context } : null,
      voice: els.voice.textContent,
      brain: els.brain.textContent,
      avatar: els.avatar.textContent
    };
  }

  const stageObserver = new MutationObserver(render);
  stageObserver.observe(stage, { attributes: true, attributeFilter: ['data-state', 'data-avatar-format', 'data-avatar-version', 'data-avatar-registry'] });
  const previewObserver = preview ? new MutationObserver(refresh) : null;
  previewObserver?.observe(preview, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-pink-panel', 'data-pink-store', 'data-pink-store-admin', 'data-pink-project'] });
  const onFullscreen = () => syncMode();
  const onModel = () => render();
  document.addEventListener('fullscreenchange', onFullscreen);
  window.addEventListener('pinkavatar:model-ready', onModel);
  window.addEventListener('pinkavatar:adapter-model-ready', onModel);

  const heartbeat = setInterval(render, 1800);

  function destroy() {
    destroyed = true;
    clearInterval(heartbeat);
    stageObserver.disconnect();
    previewObserver?.disconnect();
    document.removeEventListener('fullscreenchange', onFullscreen);
    window.removeEventListener('pinkavatar:model-ready', onModel);
    window.removeEventListener('pinkavatar:adapter-model-ready', onModel);
    hud.remove();
    delete document.body.dataset.pinkMode;
    delete workspace.dataset.pinkMode;
    delete stage.dataset.hudContext;
    delete stage.dataset.presentation;
  }

  window.PinkHolographicUI = Object.freeze({ setMode, refresh, snapshot, destroy, modes: [...MODES] });
  refresh();
})();
