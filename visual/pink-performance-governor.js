// Pink Phase 3.5 — unified visual performance governor.
// Chooses a conservative render profile from browser/device signals without touching voice or operational logic.
(() => {
  if (window.PinkPerformance) return;

  const listeners = new Set();
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  let current = null;

  function numeric(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function detectTier() {
    const memory = numeric(navigator.deviceMemory);
    const cores = numeric(navigator.hardwareConcurrency);
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
    const reducedMotion = motionQuery.matches;
    const saveData = Boolean(connection?.saveData);
    const network = String(connection?.effectiveType || '').toLowerCase();
    const constrainedNetwork = saveData || network === 'slow-2g' || network === '2g';
    const veryLowMemory = memory !== null && memory <= 2;
    const lowMemory = memory !== null && memory <= 4;
    const lowCpu = cores !== null && cores <= 4;

    if (reducedMotion || constrainedNetwork || veryLowMemory || (mobile && lowCpu && lowMemory)) return 'eco';
    if (mobile || lowMemory || lowCpu) return 'balanced';
    return 'cinematic';
  }

  function buildProfile(tier) {
    const base = {
      tier,
      reducedMotion: motionQuery.matches,
      saveData: Boolean(connection?.saveData),
      mobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
      memoryGB: numeric(navigator.deviceMemory),
      cores: numeric(navigator.hardwareConcurrency),
      effectiveType: connection?.effectiveType || null,
      hidden: document.hidden
    };

    if (tier === 'eco') return Object.freeze({
      ...base,
      targetFps: 20,
      presenceDpr: 1,
      modelDpr: 1,
      antialias: false,
      powerPreference: 'low-power',
      particles: 180,
      connections: 24,
      modelMotionScale: base.reducedMotion ? 0 : 0.55,
      presenceMotionScale: base.reducedMotion ? 0 : 0.45
    });

    if (tier === 'balanced') return Object.freeze({
      ...base,
      targetFps: 30,
      presenceDpr: 1.25,
      modelDpr: 1.2,
      antialias: false,
      powerPreference: 'low-power',
      particles: 360,
      connections: 48,
      modelMotionScale: base.reducedMotion ? 0 : 0.78,
      presenceMotionScale: base.reducedMotion ? 0 : 0.75
    });

    return Object.freeze({
      ...base,
      targetFps: 60,
      presenceDpr: 1.7,
      modelDpr: 1.65,
      antialias: true,
      powerPreference: 'high-performance',
      particles: 720,
      connections: 92,
      modelMotionScale: base.reducedMotion ? 0 : 1,
      presenceMotionScale: base.reducedMotion ? 0 : 1
    });
  }

  function publish(reason = 'boot') {
    const next = buildProfile(detectTier());
    const changed = !current || JSON.stringify(current) !== JSON.stringify(next);
    current = next;
    document.documentElement.dataset.pinkQuality = next.tier;
    const stage = document.querySelector('#pinkStage');
    if (stage) stage.dataset.pinkQuality = next.tier;
    if (!changed) return current;

    const detail = { ...next, reason };
    window.dispatchEvent(new CustomEvent('pinkperformance:change', { detail }));
    for (const listener of listeners) {
      try { listener(detail); } catch (error) { console.warn('Pink performance listener failed', error); }
    }
    return current;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    listener({ ...current, reason: 'subscribe' });
    return () => listeners.delete(listener);
  }

  function snapshot() {
    return { ...current };
  }

  const onMotion = () => publish('motion');
  const onConnection = () => publish('network');
  const onVisibility = () => publish('visibility');
  motionQuery.addEventListener?.('change', onMotion);
  connection?.addEventListener?.('change', onConnection);
  document.addEventListener('visibilitychange', onVisibility);

  window.PinkPerformance = Object.freeze({
    get profile() { return current; },
    get tier() { return current?.tier || 'balanced'; },
    refresh: () => publish('manual'),
    snapshot,
    subscribe
  });

  publish('boot');
})();
