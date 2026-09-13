// Pink Phase 3.5 — adaptive performance + runtime health governor.
(() => {
  if (window.PinkPerformance) return;

  const root = document.documentElement;
  const body = document.body;
  const stage = document.querySelector('#pinkStage');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const PROFILES = ['economy', 'balanced', 'cinematic'];
  const BUDGETS = Object.freeze({
    economy: { targetFps: 24, maxDpr: 1.15, fx: .62, blur: 7, particles: .55 },
    balanced: { targetFps: 30, maxDpr: 1.45, fx: .82, blur: 10, particles: .78 },
    cinematic: { targetFps: 60, maxDpr: 1.8, fx: 1, blur: 14, particles: 1 }
  });

  let profile = 'balanced';
  let reason = 'default';
  let longTaskScore = 0;
  let health = 'booting';
  let healthDetails = {};
  let destroyed = false;
  let healthTimer = 0;
  const hookedCanvases = new WeakSet();

  function capabilitySnapshot() {
    return {
      deviceMemory: Number(navigator.deviceMemory || 0) || null,
      hardwareConcurrency: Number(navigator.hardwareConcurrency || 0) || null,
      mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
      saveData: Boolean(connection?.saveData),
      effectiveType: String(connection?.effectiveType || ''),
      reducedMotion: motionQuery.matches,
      hidden: document.hidden
    };
  }

  function chooseInitialProfile() {
    const c = capabilitySnapshot();
    if (c.reducedMotion || c.saveData || c.deviceMemory && c.deviceMemory <= 4 || c.hardwareConcurrency && c.hardwareConcurrency <= 4 || /(^|-)2g$/.test(c.effectiveType)) {
      return ['economy', c.reducedMotion ? 'reduced-motion' : c.saveData ? 'save-data' : 'low-device-budget'];
    }
    if (c.mobile || c.deviceMemory && c.deviceMemory <= 8 || c.effectiveType === '3g') return ['balanced', 'mobile-balanced'];
    return ['cinematic', 'desktop-capable'];
  }

  function applyProfile(next, why = 'runtime') {
    const normalized = PROFILES.includes(next) ? next : 'balanced';
    profile = normalized;
    reason = String(why || 'runtime');
    const budget = BUDGETS[profile];
    body.dataset.pinkPerformance = profile;
    root.style.setProperty('--pink-perf-fx', String(budget.fx));
    root.style.setProperty('--pink-perf-blur', `${budget.blur}px`);
    root.style.setProperty('--pink-perf-particles', String(budget.particles));
    stage?.setAttribute('data-performance', profile);
    window.dispatchEvent(new CustomEvent('pinkperformance:profile', { detail: { profile, reason, budget: { ...budget } } }));
    return profile;
  }

  function degrade(why = 'runtime-pressure') {
    if (profile === 'cinematic') return applyProfile('balanced', why);
    if (profile === 'balanced') return applyProfile('economy', why);
    return profile;
  }

  function getBudget() { return { ...BUDGETS[profile] }; }

  function hookCanvas(canvas) {
    if (!canvas || hookedCanvases.has(canvas)) return;
    hookedCanvases.add(canvas);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault?.();
      stage?.setAttribute('data-webgl-health', 'lost');
      degrade('webgl-context-lost');
      window.PinkEvolution?.recordIssue?.('webgl-context-lost', canvas.className || 'pink-canvas');
      window.dispatchEvent(new CustomEvent('pinkperformance:webgl-lost', { detail: { className: canvas.className || '' } }));
    }, { passive: false });
    canvas.addEventListener('webglcontextrestored', () => {
      stage?.setAttribute('data-webgl-health', 'restored');
      window.dispatchEvent(new CustomEvent('pinkperformance:webgl-restored', { detail: { className: canvas.className || '' } }));
      const registry = window.PinkAvatarRegistry?.snapshot?.();
      if (registry?.asset) setTimeout(() => window.PinkAvatarRegistry?.refresh?.(), 250);
    });
  }

  function hookCanvases() {
    document.querySelectorAll('canvas').forEach(canvas => {
      if (canvas === document.querySelector('#fxCanvas') || stage?.contains(canvas)) hookCanvas(canvas);
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
    const modelExpectedButMissing = Boolean(registry?.asset) && !avatar?.model?.hasModel && avatar?.mode !== 'glb-model' && avatar?.mode !== 'vrm-model' && avatar?.mode !== 'gltf-model';
    health = !criticalReady || webglLost || modelExpectedButMissing ? 'degraded' : 'ok';
    healthDetails = { modules, webglLost, modelExpectedButMissing, registryStatus: registry?.status || null, avatarMode: avatar?.model?.mode || avatar?.mode || null };
    body.dataset.pinkRuntimeHealth = health;
    stage?.setAttribute('data-runtime-health', health);
    return { health, ...healthDetails };
  }

  function snapshot() {
    return {
      profile,
      reason,
      budget: getBudget(),
      capabilities: capabilitySnapshot(),
      longTaskScore,
      runtime: runtimeHealth()
    };
  }

  const [initialProfile, initialReason] = chooseInitialProfile();
  applyProfile(initialProfile, initialReason);

  let performanceObserver = null;
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
  const onMotion = () => {
    if (motionQuery.matches) applyProfile('economy', 'reduced-motion');
  };
  const onConnection = () => {
    if (connection?.saveData || /(^|-)2g$/.test(String(connection?.effectiveType || ''))) applyProfile('economy', 'network-budget');
  };
  document.addEventListener('visibilitychange', onVisibility);
  motionQuery.addEventListener?.('change', onMotion);
  connection?.addEventListener?.('change', onConnection);
  onVisibility();

  healthTimer = setInterval(() => {
    if (!destroyed && !document.hidden) runtimeHealth();
  }, 5000);
  setTimeout(runtimeHealth, 350);

  function destroy() {
    destroyed = true;
    clearInterval(healthTimer);
    canvasObserver.disconnect();
    performanceObserver?.disconnect?.();
    document.removeEventListener('visibilitychange', onVisibility);
    motionQuery.removeEventListener?.('change', onMotion);
    connection?.removeEventListener?.('change', onConnection);
    delete body.dataset.pinkPerformance;
    delete body.dataset.pinkRuntimeHealth;
    delete body.dataset.pinkVisibility;
    stage?.removeAttribute('data-performance');
    stage?.removeAttribute('data-runtime-health');
    root.style.removeProperty('--pink-perf-fx');
    root.style.removeProperty('--pink-perf-blur');
    root.style.removeProperty('--pink-perf-particles');
  }

  window.PinkPerformance = Object.freeze({
    profiles: [...PROFILES],
    get profile() { return profile; },
    getBudget,
    setProfile: (next, why = 'manual') => applyProfile(next, why),
    degrade,
    health: runtimeHealth,
    snapshot,
    destroy
  });
})();
