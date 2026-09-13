// Pink Phase 3.5 — single adaptive performance + runtime health governor.
(() => {
  if (window.PinkPerformance) return;

  const root = document.documentElement;
  const body = document.body;
  const stage = document.querySelector('#pinkStage');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const TIERS = ['economy', 'balanced', 'cinematic'];
  const BUDGETS = Object.freeze({
    economy: Object.freeze({
      targetFps: 24, maxDpr: 1.15, presenceDpr: 1, modelDpr: 1,
      antialias: false, powerPreference: 'low-power',
      fx: .62, blur: 7, particles: .55, presenceParticles: 180, presenceConnections: 24,
      presenceMotionScale: .45, modelMotionScale: .55
    }),
    balanced: Object.freeze({
      targetFps: 30, maxDpr: 1.45, presenceDpr: 1.25, modelDpr: 1.2,
      antialias: false, powerPreference: 'low-power',
      fx: .82, blur: 10, particles: .78, presenceParticles: 360, presenceConnections: 48,
      presenceMotionScale: .75, modelMotionScale: .78
    }),
    cinematic: Object.freeze({
      targetFps: 60, maxDpr: 1.8, presenceDpr: 1.7, modelDpr: 1.65,
      antialias: true, powerPreference: 'high-performance',
      fx: 1, blur: 14, particles: 1, presenceParticles: 720, presenceConnections: 92,
      presenceMotionScale: 1, modelMotionScale: 1
    })
  });

  let tier = 'balanced';
  let reason = 'default';
  let longTaskScore = 0;
  let health = 'booting';
  let healthDetails = {};
  let destroyed = false;
  let healthTimer = 0;
  let performanceObserver = null;
  const hookedCanvases = new WeakSet();
  const listeners = new Set();

  function capabilities() {
    return {
      deviceMemory: Number(navigator.deviceMemory || 0) || null,
      hardwareConcurrency: Number(navigator.hardwareConcurrency || 0) || null,
      mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
      saveData: Boolean(connection?.saveData),
      effectiveType: String(connection?.effectiveType || '').toLowerCase(),
      reducedMotion: motionQuery.matches,
      hidden: document.hidden
    };
  }

  function chooseTier() {
    const c = capabilities();
    if (
      c.reducedMotion || c.saveData ||
      (c.deviceMemory !== null && c.deviceMemory <= 4) ||
      (c.hardwareConcurrency !== null && c.hardwareConcurrency <= 4) ||
      c.effectiveType === 'slow-2g' || c.effectiveType === '2g'
    ) return ['economy', c.reducedMotion ? 'reduced-motion' : c.saveData ? 'save-data' : 'low-device-budget'];
    if (
      c.mobile ||
      (c.deviceMemory !== null && c.deviceMemory <= 8) ||
      c.effectiveType === '3g'
    ) return ['balanced', 'mobile-balanced'];
    return ['cinematic', 'desktop-capable'];
  }

  function qualitySnapshot() {
    const c = capabilities();
    return Object.freeze({
      tier,
      ...BUDGETS[tier],
      reducedMotion: c.reducedMotion,
      saveData: c.saveData,
      mobile: c.mobile,
      deviceMemory: c.deviceMemory,
      hardwareConcurrency: c.hardwareConcurrency,
      effectiveType: c.effectiveType,
      hidden: c.hidden
    });
  }

  function emitProfile(why) {
    const profile = qualitySnapshot();
    const detail = { ...profile, reason: why };
    window.dispatchEvent(new CustomEvent('pinkperformance:profile', { detail }));
    window.dispatchEvent(new CustomEvent('pinkperformance:change', { detail }));
    for (const listener of listeners) {
      try { listener(detail); } catch (error) { console.warn('Pink performance listener failed', error); }
    }
  }

  function applyTier(next, why = 'runtime') {
    const normalized = TIERS.includes(next) ? next : 'balanced';
    const changed = tier !== normalized || reason !== String(why || 'runtime');
    tier = normalized;
    reason = String(why || 'runtime');
    const budget = BUDGETS[tier];
    body.dataset.pinkPerformance = tier;
    root.dataset.pinkQuality = tier;
    root.style.setProperty('--pink-perf-fx', String(budget.fx));
    root.style.setProperty('--pink-perf-blur', `${budget.blur}px`);
    root.style.setProperty('--pink-perf-particles', String(budget.particles));
    if (stage) {
      stage.dataset.performance = tier;
      stage.dataset.pinkQuality = tier;
    }
    if (changed) emitProfile(reason);
    return qualitySnapshot();
  }

  function degrade(why = 'runtime-pressure') {
    if (tier === 'cinematic') return applyTier('balanced', why);
    if (tier === 'balanced') return applyTier('economy', why);
    return qualitySnapshot();
  }

  function refresh(why = 'manual') {
    const [next, detectedReason] = chooseTier();
    return applyTier(next, why === 'manual' ? detectedReason : why);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    listener({ ...qualitySnapshot(), reason: 'subscribe' });
    return () => listeners.delete(listener);
  }

  function hookCanvas(canvas) {
    if (!canvas || hookedCanvases.has(canvas)) return;
    hookedCanvases.add(canvas);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault?.();
      stage?.setAttribute('data-webgl-health', 'lost');
      degrade('webgl-context-lost');
      window.PinkEvolution?.recordIssue?.('webgl-context-lost', String(canvas.className || 'pink-canvas'));
      window.dispatchEvent(new CustomEvent('pinkperformance:webgl-lost', { detail: { className: String(canvas.className || '') } }));
    }, { passive: false });
    canvas.addEventListener('webglcontextrestored', () => {
      stage?.setAttribute('data-webgl-health', 'restored');
      window.dispatchEvent(new CustomEvent('pinkperformance:webgl-restored', { detail: { className: String(canvas.className || '') } }));
      const registry = window.PinkAvatarRegistry?.snapshot?.();
      if (registry?.asset) setTimeout(() => window.PinkAvatarRegistry?.refresh?.(), 250);
    });
  }

  function hookCanvases() {
    const fxCanvas = document.querySelector('#fxCanvas');
    document.querySelectorAll('canvas').forEach(canvas => {
      if (canvas === fxCanvas || stage?.contains(canvas)) hookCanvas(canvas);
    });
  }

  function runtimeHealth() {
    const registry = window.PinkAvatarRegistry?.snapshot?.();
    const avatar = window.PinkAvatar3D?.snapshot?.();
    const modules = {
      core: Boolean(window.PinkCore),
      voice: Boolean(window.PinkVoice),
      nvidia: Boolean(window.PinkNVIDIA),
      avatar: Boolean(window.PinkAvatar3D),
      registry: Boolean(window.PinkAvatarRegistry),
      voiceReactive: Boolean(window.PinkVoiceReactive),
      presence: Boolean(window.Pink3DPresence),
      holographicUI: Boolean(window.PinkHolographicUI)
    };
    const criticalReady = modules.core && modules.voice && modules.avatar && modules.registry;
    const webglLost = stage?.dataset.webglHealth === 'lost';
    const avatarMode = avatar?.model?.mode || avatar?.mode || null;
    const hasRealModel = Boolean(avatar?.model?.hasModel) || /^(glb|gltf|vrm)-model$/.test(String(avatarMode || ''));
    const modelExpectedButMissing = Boolean(registry?.asset) && registry?.status !== 'adapter-pending' && !hasRealModel;
    health = !criticalReady || webglLost || modelExpectedButMissing ? 'degraded' : 'ok';
    healthDetails = {
      modules,
      webglLost,
      modelExpectedButMissing,
      registryStatus: registry?.status || null,
      avatarMode
    };
    body.dataset.pinkRuntimeHealth = health;
    stage?.setAttribute('data-runtime-health', health);
    return { health, ...healthDetails };
  }

  function snapshot() {
    return {
      tier,
      reason,
      profile: { ...qualitySnapshot() },
      capabilities: capabilities(),
      longTaskScore,
      runtime: runtimeHealth()
    };
  }

  const [initialTier, initialReason] = chooseTier();
  applyTier(initialTier, initialReason);

  if ('PerformanceObserver' in window) {
    try {
      performanceObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 80) longTaskScore += entry.duration >= 180 ? 2 : 1;
        }
        if (longTaskScore >= 5) {
          degrade('long-task-pressure');
          longTaskScore = 0;
        }
      });
      performanceObserver.observe({ entryTypes: ['longtask'] });
    } catch (_) { performanceObserver = null; }
  }

  const canvasObserver = new MutationObserver(hookCanvases);
  canvasObserver.observe(document.body, { childList: true, subtree: true });
  hookCanvases();

  const onVisibility = () => {
    body.dataset.pinkVisibility = document.hidden ? 'paused' : 'active';
    if (!document.hidden) hookCanvases();
  };
  const onMotion = () => refresh('motion-preference');
  const onConnection = () => refresh(connection?.saveData ? 'network-save-data' : 'network-change');
  document.addEventListener('visibilitychange', onVisibility);
  motionQuery.addEventListener?.('change', onMotion);
  connection?.addEventListener?.('change', onConnection);
  onVisibility();

  healthTimer = setInterval(() => {
    if (!destroyed && !document.hidden) runtimeHealth();
  }, 5000);
  setTimeout(runtimeHealth, 700);

  function destroy() {
    destroyed = true;
    clearInterval(healthTimer);
    canvasObserver.disconnect();
    performanceObserver?.disconnect?.();
    listeners.clear();
    document.removeEventListener('visibilitychange', onVisibility);
    motionQuery.removeEventListener?.('change', onMotion);
    connection?.removeEventListener?.('change', onConnection);
    delete body.dataset.pinkPerformance;
    delete body.dataset.pinkRuntimeHealth;
    delete body.dataset.pinkVisibility;
    delete root.dataset.pinkQuality;
    stage?.removeAttribute('data-performance');
    stage?.removeAttribute('data-pink-quality');
    stage?.removeAttribute('data-runtime-health');
    root.style.removeProperty('--pink-perf-fx');
    root.style.removeProperty('--pink-perf-blur');
    root.style.removeProperty('--pink-perf-particles');
  }

  window.PinkPerformance = Object.freeze({
    tiers: [...TIERS],
    get tier() { return tier; },
    get profile() { return qualitySnapshot(); },
    get quality() { return qualitySnapshot(); },
    getBudget: () => ({ ...BUDGETS[tier] }),
    setProfile: (next, why = 'manual') => applyTier(next, why),
    degrade,
    refresh,
    subscribe,
    health: runtimeHealth,
    snapshot,
    destroy
  });
})();
