// Pink Phase 3.5 — adaptive performance governor.
// Centralizes device/network/motion signals so all visual systems degrade consistently.
(() => {
  if (window.PinkPerformance) return;

  const stage = document.querySelector('#pinkStage');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const PROFILES = Object.freeze({
    eco: Object.freeze({ tier:'eco', maxFps:24, maxDpr:1.0, particles:160, connections:20, voiceSampleMs:66, hudEffects:false }),
    balanced: Object.freeze({ tier:'balanced', maxFps:30, maxDpr:1.25, particles:360, connections:48, voiceSampleMs:50, hudEffects:true }),
    high: Object.freeze({ tier:'high', maxFps:60, maxDpr:1.7, particles:720, connections:92, voiceSampleMs:42, hudEffects:true })
  });

  let override = null;
  let current = null;
  let destroyed = false;

  function signals() {
    return {
      reducedMotion: reducedMotion.matches,
      saveData: Boolean(connection?.saveData),
      effectiveType: String(connection?.effectiveType || ''),
      deviceMemory: Number(navigator.deviceMemory || 0) || null,
      hardwareConcurrency: Number(navigator.hardwareConcurrency || 0) || null,
      mobile: /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent || ''),
      hidden: document.hidden
    };
  }

  function chooseTier(input = signals()) {
    if (override && PROFILES[override]) return override;
    const slowNetwork = /(^|\b)(slow-2g|2g)(\b|$)/.test(input.effectiveType);
    if (input.reducedMotion || input.saveData || slowNetwork || (input.deviceMemory && input.deviceMemory <= 2) || (input.hardwareConcurrency && input.hardwareConcurrency <= 4)) return 'eco';
    if (input.mobile || (input.deviceMemory && input.deviceMemory <= 4) || input.effectiveType === '3g') return 'balanced';
    return 'high';
  }

  function apply(reason = 'refresh') {
    if (destroyed) return snapshot();
    const nextSignals = signals();
    const tier = chooseTier(nextSignals);
    const previousTier = current?.tier || null;
    current = { ...PROFILES[tier], signals: nextSignals, reason };
    document.body.dataset.pinkPerformance = tier;
    if (stage) stage.dataset.pinkPerformance = tier;
    if (previousTier !== tier) {
      window.dispatchEvent(new CustomEvent('pinkperformance:change', { detail: snapshot() }));
      window.PinkEvolution?.recordSession?.(`performance:${tier}`);
    }
    return snapshot();
  }

  function profile() {
    return current ? { ...current } : apply('initial');
  }

  function setOverride(value = null) {
    const next = value == null ? null : String(value).toLowerCase();
    if (next && !PROFILES[next]) throw new Error(`Unsupported Pink performance tier: ${next}`);
    override = next;
    try {
      if (override) sessionStorage.setItem('pink_performance_override', override);
      else sessionStorage.removeItem('pink_performance_override');
    } catch (_) {}
    return apply('override');
  }

  function snapshot() {
    const value = current || { ...PROFILES[chooseTier()], signals: signals(), reason:'snapshot' };
    return { ...value, signals: { ...value.signals }, override };
  }

  function restoreOverride() {
    try {
      const saved = sessionStorage.getItem('pink_performance_override');
      if (saved && PROFILES[saved]) override = saved;
    } catch (_) {}
  }

  const onChange = () => apply('environment');
  reducedMotion.addEventListener?.('change', onChange);
  connection?.addEventListener?.('change', onChange);

  function destroy() {
    destroyed = true;
    reducedMotion.removeEventListener?.('change', onChange);
    connection?.removeEventListener?.('change', onChange);
    delete document.body.dataset.pinkPerformance;
    if (stage) delete stage.dataset.pinkPerformance;
  }

  restoreOverride();
  window.PinkPerformance = Object.freeze({ profiles: PROFILES, profile, snapshot, refresh: () => apply('manual'), setOverride, destroy });
  apply('boot');
})();
