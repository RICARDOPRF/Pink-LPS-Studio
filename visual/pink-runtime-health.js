// Pink Phase 3.5.2 — lightweight runtime health diagnostics.
(() => {
  if (window.PinkRuntimeHealth) return;

  const stage = document.querySelector('#pinkStage');
  let timer = 0;
  let last = null;
  let destroyed = false;

  function moduleState() {
    return {
      foundation: Boolean(window.PinkFoundation),
      operatingCore: Boolean(window.PinkOperatingCore),
      core: Boolean(window.PinkCore),
      voice: Boolean(window.PinkVoice),
      nvidia: Boolean(window.PinkNVIDIA),
      avatar: Boolean(window.PinkAvatar3D),
      registry: Boolean(window.PinkAvatarRegistry),
      performance: Boolean(window.PinkPerformance),
      presence: Boolean(window.Pink3DPresence),
      holographicUI: Boolean(window.PinkHolographicUI),
      voiceReactive: Boolean(window.PinkVoiceReactive),
      memoryCore: Boolean(window.PinkMemoryCore),
      memoryCloud: Boolean(window.PinkMemoryCloud),
      evolution: Boolean(window.PinkEvolution)
    };
  }

  function snapshot() {
    const modules = moduleState();
    const foundation = window.PinkFoundation?.health?.() || null;
    const memoryApi = window.PinkMemoryCloud || null;
    const memoryHealth = memoryApi?.health?.() || null;
    const memoryMode = memoryHealth?.mode || memoryApi?.status || (!modules.memoryCloud && modules.memoryCore ? 'local-fallback' : 'unavailable');
    const memoryConfigured = window.PinkPublicConfig?.features?.cloudMemory === true;
    const memoryFallback = memoryMode === 'local-fallback';
    const memoryHasError = Boolean(memoryApi?.error || memoryHealth?.lastError);
    const registry = window.PinkAvatarRegistry?.snapshot?.() || null;
    const avatar = window.PinkAvatar3D?.snapshot?.() || null;
    const performance = window.PinkPerformance?.snapshot?.() || window.PinkPerformance?.profile?.() || null;
    const presence = window.Pink3DPresence?.snapshot?.() || null;
    const voiceMode = window.PinkVoice?.mode || 'idle';
    const modelExpected = Boolean(registry?.asset);
    const avatarMode = avatar?.model?.mode || avatar?.mode || null;
    const hasRealModel = Boolean(avatar?.model?.hasModel) || /^(glb|gltf|vrm)-model$/.test(String(avatarMode || ''));
    const webglLost = stage?.dataset.webglHealth === 'lost' || presence?.fallback === true;
    const criticalReady = modules.core && modules.voice && modules.avatar && modules.registry && modules.performance;
    const modelMissing = modelExpected && registry?.status !== 'adapter-pending' && !hasRealModel;
    // Foundation and memory diagnostics are informational here; they must not change the legacy visual/runtime status gate.
    const status = !criticalReady || webglLost || modelMissing ? 'degraded' : 'ok';

    return {
      status,
      modules,
      foundation: {
        available: modules.foundation,
        ok: foundation?.ok ?? null,
        configOk: foundation?.config?.ok ?? null,
        ledgerConsistent: foundation?.ledgerConsistent ?? null
      },
      memory: {
        coreAvailable: modules.memoryCore,
        cloudApiAvailable: modules.memoryCloud,
        configured: memoryConfigured,
        mode: memoryMode,
        fallback: memoryFallback,
        hasError: memoryHasError
      },
      voiceMode,
      webglLost,
      modelExpected,
      modelMissing,
      avatarMode,
      registryStatus: registry?.status || null,
      performanceTier: performance?.tier || null,
      presenceReady: presence?.ready ?? null,
      checkedAt: Date.now()
    };
  }

  function refresh(reason = 'manual') {
    if (destroyed) return last;
    last = snapshot();
    document.body.dataset.pinkRuntimeHealth = last.status;
    if (stage) stage.dataset.runtimeHealth = last.status;
    window.dispatchEvent(new CustomEvent('pinkruntime:health', { detail: { ...last, reason } }));
    return { ...last };
  }

  function onSignal(event) {
    refresh(event?.type || 'signal');
  }

  const signals = [
    'pink3d:ready',
    'pinkavatar:model-ready',
    'pinkavatar:model-error',
    'pinkavatar:performance-bridge-ready',
    'pinkperformance:change',
    'pinkperformance:webgl-lost',
    'pinkperformance:webgl-restored',
    'pinkui:mode-change',
    'pinkfoundation:ready',
    'pinkfoundation:error',
    'pinkmemory:ready'
  ];
  signals.forEach(name => window.addEventListener(name, onSignal));

  const onVisibility = () => {
    if (!document.hidden) refresh('visibility');
  };
  document.addEventListener('visibilitychange', onVisibility);

  timer = setInterval(() => {
    if (!document.hidden) refresh('interval');
  }, 5000);
  setTimeout(() => refresh('boot'), 900);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearInterval(timer);
    signals.forEach(name => window.removeEventListener(name, onSignal));
    document.removeEventListener('visibilitychange', onVisibility);
    delete document.body.dataset.pinkRuntimeHealth;
    if (stage) delete stage.dataset.runtimeHealth;
  }

  window.PinkRuntimeHealth = Object.freeze({
    refresh,
    snapshot: () => last ? { ...last } : refresh('snapshot'),
    destroy
  });
})();
