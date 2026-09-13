// Pink Phase 3.2 — avatar architecture and fallback motion runtime
// Keeps the current portrait as the visual fallback until an original/licensed GLB/VRM is available.
(() => {
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.PinkAvatar3D) return;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const STATE_PROFILES = {
    idle:       { breathe: .75, amplitude: 1.0, look: .65, expression: 'neutral' },
    listening:  { breathe: .92, amplitude: 1.15, look: 1.0, expression: 'attentive' },
    thinking:   { breathe: .62, amplitude: .72, look: .42, expression: 'thinking' },
    speaking:   { breathe: 1.05, amplitude: 1.1, look: .82, expression: 'warm' },
    executing:  { breathe: .82, amplitude: .65, look: .38, expression: 'focused' },
    reviewing:  { breathe: .68, amplitude: .65, look: .45, expression: 'focused' },
    presenting: { breathe: .78, amplitude: .8, look: .62, expression: 'confident' },
    success:    { breathe: .86, amplitude: .88, look: .72, expression: 'warm' },
    error:      { breathe: .52, amplitude: .45, look: .25, expression: 'concerned' }
  };

  class StateController {
    constructor(element) {
      this.element = element;
      this.state = element.dataset.state || 'idle';
      this.listeners = new Set();
      this.observer = new MutationObserver(() => this.set(this.element.dataset.state || 'idle', false));
      this.observer.observe(element, { attributes: true, attributeFilter: ['data-state'] });
    }
    set(nextState, syncDom = true) {
      const state = STATE_PROFILES[nextState] ? nextState : 'idle';
      if (syncDom && this.element.dataset.state !== state) this.element.dataset.state = state;
      if (state === this.state) return;
      this.state = state;
      this.listeners.forEach(listener => listener(state, this.profile()));
    }
    profile() { return STATE_PROFILES[this.state] || STATE_PROFILES.idle; }
    subscribe(listener) {
      this.listeners.add(listener);
      listener(this.state, this.profile());
      return () => this.listeners.delete(listener);
    }
    destroy() { this.observer.disconnect(); this.listeners.clear(); }
  }

  class AvatarLoader {
    constructor(element) {
      this.element = element;
      this.adapter = null;
      this.model = null;
      this.mode = 'portrait-fallback';
    }
    async load(config = {}) {
      const modelUrl = config.modelUrl || config.url || null;
      if (!modelUrl) return this.snapshot();
      const adapter = config.adapter || window.PinkAvatarModelAdapter;
      if (!adapter?.load) throw new Error('Pink avatar model adapter is not configured');
      const format = String(config.format || modelUrl.split('.').pop() || '').toLowerCase();
      if (!['glb', 'gltf', 'vrm'].includes(format)) throw new Error(`Unsupported Pink avatar format: ${format || 'unknown'}`);
      this.destroyModel();
      this.model = await adapter.load({ stage: this.element, url: modelUrl, format, config });
      if (!this.model) throw new Error('Pink avatar model adapter returned no model controller');
      this.adapter = adapter;
      this.mode = `${format}-model`;
      this.element.classList.add('pink-avatar-model-ready');
      window.dispatchEvent(new CustomEvent('pinkavatar:model-ready', { detail: { format, url: modelUrl } }));
      return this.snapshot();
    }
    call(method, ...args) { this.model?.[method]?.(...args); }
    destroyModel() {
      try { this.model?.destroy?.(); } catch (error) { console.warn('Pink avatar: model cleanup failed', error); }
      this.model = null;
      this.adapter = null;
      this.mode = 'portrait-fallback';
      this.element.classList.remove('pink-avatar-model-ready');
    }
    snapshot() { return { mode: this.mode, hasModel: Boolean(this.model) }; }
    destroy() { this.destroyModel(); }
  }

  class FacialController {
    constructor(element, loader) {
      this.element = element;
      this.loader = loader;
      this.expression = 'neutral';
      this.blinkTimer = 0;
      this.blinkEndTimer = 0;
      this.destroyed = false;
      this.scheduleBlink();
    }
    setExpression(expression = 'neutral') {
      this.expression = expression;
      this.element.dataset.expression = expression;
      this.loader.call('setExpression', expression);
    }
    blink() {
      if (this.destroyed || document.hidden) return;
      this.element.classList.add('is-blinking');
      this.loader.call('blink');
      clearTimeout(this.blinkEndTimer);
      this.blinkEndTimer = setTimeout(() => this.element.classList.remove('is-blinking'), 115);
      this.scheduleBlink();
    }
    scheduleBlink() {
      clearTimeout(this.blinkTimer);
      if (this.destroyed) return;
      const delay = 3200 + Math.random() * 2800;
      this.blinkTimer = setTimeout(() => this.blink(), delay);
    }
    destroy() {
      this.destroyed = true;
      clearTimeout(this.blinkTimer);
      clearTimeout(this.blinkEndTimer);
      this.element.classList.remove('is-blinking');
      delete this.element.dataset.expression;
    }
  }

  class VisemeController {
    constructor(element, loader) {
      this.element = element;
      this.loader = loader;
      this.current = 'sil';
      this.weight = 0;
    }
    set(viseme = 'sil', weight = 1) {
      this.current = String(viseme || 'sil').toLowerCase();
      this.weight = clamp(weight);
      this.element.dataset.viseme = this.current;
      this.element.style.setProperty('--pink-mouth-open', String(this.weight));
      this.loader.call('setViseme', this.current, this.weight);
    }
    fromAmplitude(level = 0) {
      const normalized = clamp((Number(level) - .03) / .55);
      this.set(normalized > .72 ? 'aa' : normalized > .38 ? 'oh' : normalized > .12 ? 'eh' : 'sil', normalized);
    }
    reset() { this.set('sil', 0); }
    destroy() {
      this.reset();
      delete this.element.dataset.viseme;
      this.element.style.removeProperty('--pink-mouth-open');
    }
  }

  class AudioReactiveController {
    constructor(visemes) {
      this.visemes = visemes;
      this.analyser = null;
      this.buffer = null;
      this.externalLevel = 0;
    }
    attachAnalyser(analyser) {
      this.analyser = analyser || null;
      this.buffer = analyser ? new Uint8Array(analyser.fftSize || 2048) : null;
    }
    setLevel(level) { this.externalLevel = clamp(level); }
    sample() {
      if (this.analyser && this.buffer) {
        this.analyser.getByteTimeDomainData(this.buffer);
        let sum = 0;
        for (const value of this.buffer) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        return clamp(Math.sqrt(sum / this.buffer.length) * 2.6);
      }
      return this.externalLevel;
    }
    update(isSpeaking) {
      const level = isSpeaking ? this.sample() : 0;
      this.visemes.fromAmplitude(level);
      return level;
    }
    destroy() { this.analyser = null; this.buffer = null; this.externalLevel = 0; }
  }

  class AnimationController {
    constructor(element, stateController, loader, facial, audio) {
      this.element = element;
      this.stateController = stateController;
      this.loader = loader;
      this.facial = facial;
      this.audio = audio;
      this.raf = 0;
      this.last = 0;
      this.elapsed = 0;
      this.running = !document.hidden;
      this.destroyed = false;
      this.reducedMotion = motionQuery.matches;
      this.look = { x: 0, y: 0, targetX: 0, targetY: 0 };
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerLeave = this.onPointerLeave.bind(this);
      this.onVisibility = this.onVisibility.bind(this);
      this.onMotion = this.onMotion.bind(this);
      element.addEventListener('pointermove', this.onPointerMove, { passive: true });
      element.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
      document.addEventListener('visibilitychange', this.onVisibility);
      motionQuery.addEventListener('change', this.onMotion);
      this.unsubscribe = stateController.subscribe((state, profile) => {
        facial.setExpression(profile.expression);
        loader.call('setState', state, profile);
        this.schedule();
      });
      this.schedule();
    }
    onPointerMove(event) {
      if (this.reducedMotion) return;
      const rect = this.element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.look.targetX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      this.look.targetY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    }
    onPointerLeave() { this.look.targetX = 0; this.look.targetY = 0; }
    onVisibility() {
      this.running = !document.hidden;
      this.last = 0;
      if (!this.running) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.schedule();
    }
    onMotion() {
      this.reducedMotion = motionQuery.matches;
      this.onPointerLeave();
      this.schedule();
    }
    schedule() {
      if (this.raf || !this.running || this.destroyed) return;
      this.raf = requestAnimationFrame(time => this.tick(time));
    }
    tick(now) {
      this.raf = 0;
      if (!this.running || this.destroyed) return;
      const dt = this.last ? Math.min((now - this.last) / 1000, .08) : 0;
      this.last = now;
      if (!this.reducedMotion) this.elapsed += dt;
      const state = this.stateController.state;
      const profile = this.stateController.profile();
      const movement = this.reducedMotion ? 0 : 1;
      this.look.x = lerp(this.look.x, this.look.targetX * profile.look, .055);
      this.look.y = lerp(this.look.y, this.look.targetY * profile.look, .055);
      const breathWave = Math.sin(this.elapsed * Math.PI * profile.breathe);
      const breatheY = breathWave * 1.65 * profile.amplitude * movement;
      const breatheScale = 1.015 + (breathWave + 1) * .0019 * profile.amplitude * movement;
      const headRoll = this.look.x * .48 * movement;
      const level = this.audio.update(state === 'speaking');

      this.element.style.setProperty('--pink-look-x', `${(this.look.x * 3.2 * movement).toFixed(2)}px`);
      this.element.style.setProperty('--pink-look-y', `${(this.look.y * 2.0 * movement).toFixed(2)}px`);
      this.element.style.setProperty('--pink-breathe-y', `${breatheY.toFixed(2)}px`);
      this.element.style.setProperty('--pink-avatar-scale', breatheScale.toFixed(4));
      this.element.style.setProperty('--pink-head-roll', `${headRoll.toFixed(2)}deg`);
      this.element.style.setProperty('--pink-audio-level', level.toFixed(3));

      this.loader.call('setLook', this.look.x, this.look.y);
      this.loader.call('setAudioLevel', level);
      this.loader.call('update', { now, dt, elapsed: this.elapsed, state, profile, audioLevel: level });

      if (!this.reducedMotion || state === 'speaking') this.schedule();
    }
    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.unsubscribe?.();
      this.element.removeEventListener('pointermove', this.onPointerMove);
      this.element.removeEventListener('pointerleave', this.onPointerLeave);
      document.removeEventListener('visibilitychange', this.onVisibility);
      motionQuery.removeEventListener('change', this.onMotion);
      for (const variable of ['--pink-look-x','--pink-look-y','--pink-breathe-y','--pink-avatar-scale','--pink-head-roll','--pink-audio-level']) this.element.style.removeProperty(variable);
    }
  }

  class AvatarController {
    constructor(element) {
      this.element = element;
      this.loader = new AvatarLoader(element);
      this.state = new StateController(element);
      this.facial = new FacialController(element, this.loader);
      this.visemes = new VisemeController(element, this.loader);
      this.audio = new AudioReactiveController(this.visemes);
      this.animation = new AnimationController(element, this.state, this.loader, this.facial, this.audio);
      element.classList.add('pink-avatar-runtime');
      window.dispatchEvent(new CustomEvent('pinkavatar:ready', { detail: this.snapshot() }));
    }
    setState(state) { this.state.set(state); }
    setViseme(viseme, weight) { this.visemes.set(viseme, weight); }
    setAudioLevel(level) { this.audio.setLevel(level); this.animation.schedule(); }
    attachAnalyser(analyser) { this.audio.attachAnalyser(analyser); this.animation.schedule(); }
    loadModel(config) { return this.loader.load(config); }
    snapshot() {
      return {
        state: this.state.state,
        expression: this.facial.expression,
        viseme: this.visemes.current,
        visemeWeight: this.visemes.weight,
        reducedMotion: this.animation.reducedMotion,
        ...this.loader.snapshot()
      };
    }
    destroy() {
      this.animation.destroy();
      this.audio.destroy();
      this.visemes.destroy();
      this.facial.destroy();
      this.state.destroy();
      this.loader.destroy();
      this.element.classList.remove('pink-avatar-runtime');
    }
  }

  const controller = new AvatarController(stage);
  window.PinkAvatar3D = {
    controller,
    setState: state => controller.setState(state),
    setViseme: (viseme, weight) => controller.setViseme(viseme, weight),
    setAudioLevel: level => controller.setAudioLevel(level),
    attachAnalyser: analyser => controller.attachAnalyser(analyser),
    loadModel: config => controller.loadModel(config),
    snapshot: () => controller.snapshot(),
    destroy: () => controller.destroy()
  };
})();
