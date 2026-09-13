// Pink Phase 3.5.1 — performance bridge for the real GLB/VRM avatar.
// Keeps facial/viseme state updates intact while reducing expensive WebGL draws on constrained devices.
const stage = document.querySelector('#pinkStage');
const adapter = window.PinkAvatarModelAdapter;

if (stage && adapter && !adapter.performanceGoverned) {
  const originalLoad = adapter.load.bind(adapter);

  function profile() {
    const value = window.PinkPerformance?.profile?.();
    if (value && typeof value === 'object') return value;
    const low = (navigator.deviceMemory && navigator.deviceMemory <= 4) || /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent || '');
    return low
      ? { tier: 'balanced', maxFps: 30, maxDpr: 1.2 }
      : { tier: 'high', maxFps: 60, maxDpr: 1.65 };
  }

  function govern(controller) {
    if (!controller || controller.__pinkPerformanceGoverned) return controller;

    const originalUpdate = typeof controller.update === 'function' ? controller.update.bind(controller) : null;
    const originalDestroy = typeof controller.destroy === 'function' ? controller.destroy.bind(controller) : null;
    const originalResize = typeof controller.resize === 'function' ? controller.resize.bind(controller) : null;
    let lastDrawAt = 0;
    let accumulatedDt = 0;
    let destroyed = false;

    function applyBudget() {
      if (destroyed) return;
      const current = profile();
      const maxDpr = Math.max(.75, Math.min(2, Number(current.maxDpr) || 1.2));
      controller.renderer?.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, maxDpr));
      originalResize?.();
      stage.dataset.avatarPerformance = String(current.tier || 'balanced');
      stage.dataset.avatarMaxFps = String(Math.max(12, Number(current.maxFps) || 30));
      stage.dataset.avatarMaxDpr = String(maxDpr);
    }

    if (originalUpdate) {
      controller.update = (frame = {}) => {
        if (destroyed) return;
        accumulatedDt = Math.min(.12, accumulatedDt + Math.max(0, Number(frame.dt) || 0));
        if (document.hidden) return;

        const current = profile();
        const maxFps = Math.max(12, Number(current.maxFps) || 30);
        const now = performance.now();
        if (lastDrawAt && now - lastDrawAt < 1000 / maxFps) return;

        lastDrawAt = now;
        const dt = accumulatedDt;
        accumulatedDt = 0;
        originalUpdate({ ...frame, dt });
      };
    }

    const onPerformanceChange = () => {
      lastDrawAt = 0;
      applyBudget();
    };
    window.addEventListener('pinkperformance:change', onPerformanceChange);

    controller.destroy = () => {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('pinkperformance:change', onPerformanceChange);
      delete stage.dataset.avatarPerformance;
      delete stage.dataset.avatarMaxFps;
      delete stage.dataset.avatarMaxDpr;
      originalDestroy?.();
    };

    Object.defineProperty(controller, '__pinkPerformanceGoverned', { value: true, enumerable: false });
    applyBudget();
    return controller;
  }

  window.PinkAvatarModelAdapter = Object.freeze({
    ...adapter,
    version: '3.5.1',
    performanceGoverned: true,
    async load(options) {
      return govern(await originalLoad(options));
    }
  });

  window.dispatchEvent(new CustomEvent('pinkavatar:performance-bridge-ready', {
    detail: { version: '3.5.1' }
  }));
}
