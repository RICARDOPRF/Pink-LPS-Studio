// Pink Phase 3.4 — GLB/GLTF/VRM model adapter for the definitive Pink avatar.
// Loads the active model discovered by PinkAvatarRegistry and maps existing Pink controls
// (state, look, expressions, blink, visemes and jaw) to real Three.js/VRM geometry.
(() => {
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.PinkAvatarModelAdapter) return;

  const THREE_SPEC = 'three';
  const GLTF_SPEC = 'three/addons/loaders/GLTFLoader.js';
  const VRM_SPEC = '@pixiv/three-vrm';

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
  const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const VISEME_ALIASES = Object.freeze({
    aa: ['aa', 'a', 'visemeaa', 'moutha', 'jawopen'],
    oh: ['oh', 'o', 'visemeoh', 'moutho'],
    ee: ['ee', 'e', 'ih', 'i', 'visemeee', 'mouthi'],
    uh: ['uh', 'u', 'ou', 'visemeuh', 'mouthu'],
    fv: ['fv', 'f', 'v', 'visemefv'],
    sil: []
  });

  const EXPRESSION_PRESETS = Object.freeze({
    neutral: null,
    attentive: ['surprised', 'lookattentive'],
    thinking: ['relaxed', 'thinking'],
    focused: ['neutral', 'focused'],
    warm: ['happy', 'smile'],
    confident: ['happy', 'smile'],
    concerned: ['sad', 'concerned']
  });

  let dependenciesPromise = null;

  async function dependencies(format) {
    if (!dependenciesPromise) {
      dependenciesPromise = Promise.all([
        import(THREE_SPEC),
        import(GLTF_SPEC)
      ]).then(([THREE, loaderModule]) => ({
        THREE,
        GLTFLoader: loaderModule.GLTFLoader
      }));
    }

    const base = await dependenciesPromise;
    if (format !== 'vrm') return { ...base, VRMLoaderPlugin: null, VRMUtils: null };

    const vrmModule = await import(VRM_SPEC);
    return {
      ...base,
      VRMLoaderPlugin: vrmModule.VRMLoaderPlugin,
      VRMUtils: vrmModule.VRMUtils
    };
  }

  function materialList(material) {
    return Array.isArray(material) ? material : material ? [material] : [];
  }

  function firstByAliases(index, aliases = []) {
    for (const alias of aliases.map(normalizeName)) {
      if (index.has(alias)) return index.get(alias);
    }
    for (const [name, target] of index.entries()) {
      if (aliases.some(alias => name.includes(normalizeName(alias)))) return target;
    }
    return null;
  }

  class PinkModelRuntime {
    constructor({ stage, deps, gltf, vrm, config, format, url, canvas, renderer, scene, camera, root }) {
      this.stage = stage;
      this.THREE = deps.THREE;
      this.gltf = gltf;
      this.vrm = vrm;
      this.config = config || {};
      this.format = format;
      this.url = url;
      this.canvas = canvas;
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.root = root;
      this.destroyed = false;
      this.currentViseme = 'sil';
      this.currentExpression = null;
      this.audioLevel = 0;
      this.look = { x: 0, y: 0 };
      this.state = 'idle';
      this.elapsed = 0;
      this.morphIndex = new Map();
      this.bones = new Map();
      this.baseBoneRotations = new Map();
      this.baseRootPosition = root.position.clone();
      this.baseRootScale = root.scale.clone();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(stage);
      this.indexModel();
      this.fitModel();
      this.resize();
      this.render();
    }

    indexModel() {
      this.root.traverse((object) => {
        if (object.isBone || /bone/i.test(object.type || '')) {
          const key = normalizeName(object.name);
          if (key) {
            this.bones.set(key, object);
            this.baseBoneRotations.set(object, object.rotation.clone());
          }
        }

        if (!object.morphTargetDictionary || !object.morphTargetInfluences) return;
        for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
          const key = normalizeName(name);
          if (!key || !Number.isInteger(index)) continue;
          const list = this.morphIndex.get(key) || [];
          list.push({ mesh: object, index });
          this.morphIndex.set(key, list);
        }
      });

      if (this.vrm?.humanoid?.getNormalizedBoneNode) {
        for (const name of ['head', 'neck', 'spine', 'chest', 'upperChest', 'leftEye', 'rightEye', 'jaw']) {
          const bone = this.vrm.humanoid.getNormalizedBoneNode(name);
          if (bone) {
            this.bones.set(normalizeName(name), bone);
            if (!this.baseBoneRotations.has(bone)) this.baseBoneRotations.set(bone, bone.rotation.clone());
          }
        }
      }
    }

    fitModel() {
      const { THREE } = this;
      const metadata = this.config.metadata || this.config.asset?.metadata || {};
      const framing = metadata.framing && typeof metadata.framing === 'object' ? metadata.framing : {};
      const box = new THREE.Box3().setFromObject(this.root);
      const size = box.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
      const desiredHeight = Number(framing.height) > 0 ? Number(framing.height) : 3.35;
      const scale = Number(framing.scale) > 0
        ? Number(framing.scale)
        : desiredHeight / Math.max(size.y, maxDimension * 0.72, 0.001);

      this.root.scale.multiplyScalar(scale);
      const scaledBox = new THREE.Box3().setFromObject(this.root);
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
      const scaledSize = scaledBox.getSize(new THREE.Vector3());

      this.root.position.x -= scaledCenter.x;
      this.root.position.y -= scaledCenter.y;
      this.root.position.z -= scaledCenter.z;

      const yOffset = Number(framing.yOffset);
      const xOffset = Number(framing.xOffset);
      this.root.position.x += Number.isFinite(xOffset) ? xOffset : 0;
      this.root.position.y += Number.isFinite(yOffset) ? yOffset : -0.05;

      const fov = Number(framing.fov);
      this.camera.fov = Number.isFinite(fov) && fov >= 18 && fov <= 60 ? fov : 28;
      this.camera.updateProjectionMatrix();

      const portraitHeight = Math.max(scaledSize.y, 0.5);
      const distance = portraitHeight / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
      const distanceMultiplier = Number(framing.distanceMultiplier);
      this.camera.position.set(0, Number(framing.cameraY) || 0, distance * (Number.isFinite(distanceMultiplier) ? distanceMultiplier : 1.08));
      this.camera.lookAt(0, Number(framing.targetY) || 0, 0);

      this.baseRootPosition.copy(this.root.position);
      this.baseRootScale.copy(this.root.scale);
    }

    resize() {
      if (this.destroyed) return;
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || /iPhone|iPad|Android/i.test(navigator.userAgent);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.2 : 1.55));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.render();
    }

    expressionManager() {
      return this.vrm?.expressionManager || null;
    }

    setExpressionValue(name, value) {
      const manager = this.expressionManager();
      if (!manager || !name) return false;
      try {
        manager.setValue(name, clamp(value));
        return true;
      } catch {
        return false;
      }
    }

    setMorph(aliasList, value) {
      const target = firstByAliases(this.morphIndex, aliasList);
      if (!target) return false;
      const entries = Array.isArray(target) ? target : [target];
      for (const entry of entries) {
        if (entry?.mesh?.morphTargetInfluences && Number.isInteger(entry.index)) {
          entry.mesh.morphTargetInfluences[entry.index] = clamp(value);
        }
      }
      return true;
    }

    clearVisemes() {
      const manager = this.expressionManager();
      if (manager) {
        for (const name of ['aa', 'ih', 'ou', 'ee', 'oh']) {
          try { manager.setValue(name, 0); } catch {}
        }
      }
      for (const aliases of Object.values(VISEME_ALIASES)) this.setMorph(aliases, 0);
    }

    setViseme(viseme = 'sil', weight = 0, jaw = weight) {
      if (this.destroyed) return;
      const name = String(viseme || 'sil').toLowerCase();
      const amount = clamp(weight);
      this.clearVisemes();
      this.currentViseme = name;

      if (name !== 'sil' && amount > 0) {
        const vrmPreset = { aa: 'aa', oh: 'oh', ee: 'ee', uh: 'ou', fv: null }[name] || null;
        let applied = false;
        if (vrmPreset) applied = this.setExpressionValue(vrmPreset, amount);
        if (!applied) this.setMorph(VISEME_ALIASES[name] || [name], amount);
      }

      this.setJaw(jaw);
      this.render();
    }

    setJaw(value = 0) {
      if (this.destroyed) return;
      const amount = clamp(value);
      const jawMorph = firstByAliases(this.morphIndex, ['jawopen', 'mouthopen', 'openjaw']);
      if (jawMorph) this.setMorph(['jawopen', 'mouthopen', 'openjaw'], amount);

      const jawBone = firstByAliases(this.bones, ['jaw', 'lowerjaw', 'mandible']);
      if (jawBone) {
        const base = this.baseBoneRotations.get(jawBone);
        if (base) {
          jawBone.rotation.copy(base);
          jawBone.rotation.x += amount * 0.20;
        }
      }
    }

    setExpression(expression = 'neutral') {
      if (this.destroyed) return;
      const next = String(expression || 'neutral').toLowerCase();
      const manager = this.expressionManager();

      if (manager && this.currentExpression) {
        try { manager.setValue(this.currentExpression, 0); } catch {}
      }

      this.currentExpression = null;
      const candidates = EXPRESSION_PRESETS[next] || [];
      if (manager && candidates?.length) {
        for (const candidate of candidates) {
          if (this.setExpressionValue(candidate, next === 'warm' || next === 'confident' ? 0.26 : 0.18)) {
            this.currentExpression = candidate;
            break;
          }
        }
      } else if (next === 'warm' || next === 'confident') {
        this.setMorph(['smile', 'happy'], 0.2);
      }
      this.render();
    }

    blink() {
      if (this.destroyed) return;
      const manager = this.expressionManager();
      let applied = false;
      if (manager) applied = this.setExpressionValue('blink', 1);
      if (!applied) {
        this.setMorph(['blink', 'blinkleft', 'blinkright', 'eyesclosed'], 1);
      }
      setTimeout(() => {
        if (this.destroyed) return;
        if (manager) {
          try { manager.setValue('blink', 0); } catch {}
        }
        this.setMorph(['blink', 'blinkleft', 'blinkright', 'eyesclosed'], 0);
        this.render();
      }, 105);
      this.render();
    }

    setLook(x = 0, y = 0) {
      if (this.destroyed) return;
      this.look.x = Math.max(-1, Math.min(1, Number(x) || 0));
      this.look.y = Math.max(-1, Math.min(1, Number(y) || 0));

      const head = firstByAliases(this.bones, ['head']);
      const neck = firstByAliases(this.bones, ['neck']);
      const target = head || neck;
      if (target) {
        const base = this.baseBoneRotations.get(target);
        if (base) {
          target.rotation.copy(base);
          target.rotation.y += this.look.x * 0.13;
          target.rotation.x += this.look.y * 0.08;
        }
      } else {
        this.root.rotation.y = this.look.x * 0.045;
        this.root.rotation.x = this.look.y * 0.025;
      }
    }

    setAudioLevel(level = 0) {
      this.audioLevel = clamp(level);
    }

    setState(state = 'idle', profile = {}) {
      this.state = String(state || 'idle');
      this.profile = profile || {};
    }

    update(frame = {}) {
      if (this.destroyed) return;
      const dt = Math.min(Math.max(Number(frame.dt) || 0, 0), 0.1);
      const elapsed = Number(frame.elapsed) || 0;
      this.elapsed = elapsed;

      const breatheStrength = frame.state === 'speaking' ? 0.012 : 0.007;
      this.root.position.y = this.baseRootPosition.y + Math.sin(elapsed * 1.65) * breatheStrength;
      const pulse = 1 + this.audioLevel * 0.004;
      this.root.scale.set(
        this.baseRootScale.x * pulse,
        this.baseRootScale.y * pulse,
        this.baseRootScale.z * pulse
      );

      try { this.vrm?.update?.(dt); } catch {}
      this.render();
    }

    render() {
      if (this.destroyed) return;
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.resizeObserver.disconnect();

      try { this.vrm?.dispose?.(); } catch {}
      const disposedTextures = new Set();
      this.root.traverse((object) => {
        object.geometry?.dispose?.();
        for (const material of materialList(object.material)) {
          for (const value of Object.values(material)) {
            if (value?.isTexture && !disposedTextures.has(value)) {
              value.dispose?.();
              disposedTextures.add(value);
            }
          }
          material.dispose?.();
        }
      });

      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.canvas.remove();
      this.stage.classList.remove('pink-avatar-model-rendering');
    }

    snapshot() {
      return {
        format: this.format,
        url: this.url,
        vrm: Boolean(this.vrm),
        morphTargets: this.morphIndex.size,
        bones: this.bones.size,
        state: this.state
      };
    }
  }

  async function load({ stage: targetStage = stage, url, format, config = {} } = {}) {
    if (!url) throw new Error('Pink avatar model URL is required');
    const normalizedFormat = String(format || url.split('.').pop() || '').toLowerCase();
    if (!['glb', 'gltf', 'vrm'].includes(normalizedFormat)) throw new Error(`Unsupported Pink avatar format: ${normalizedFormat || 'unknown'}`);

    const deps = await dependencies(normalizedFormat);
    const { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils } = deps;

    const canvas = document.createElement('canvas');
    canvas.className = 'pink-avatar-model-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    targetStage.prepend(canvas);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !/iPhone|iPad|Android/i.test(navigator.userAgent),
        powerPreference: 'high-performance'
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
      const hemisphere = new THREE.HemisphereLight(0xbfeeff, 0x171322, 2.15);
      const key = new THREE.DirectionalLight(0xffffff, 2.8);
      const rim = new THREE.DirectionalLight(0xff74bd, 1.45);
      key.position.set(2.4, 3.2, 4.5);
      rim.position.set(-3.2, 2.2, -2.4);
      scene.add(hemisphere, key, rim);

      const loader = new GLTFLoader();
      if (normalizedFormat === 'vrm') {
        if (!VRMLoaderPlugin) throw new Error('VRM loader dependency is unavailable');
        loader.register((parser) => new VRMLoaderPlugin(parser));
      }

      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData?.vrm || null;
      if (vrm && VRMUtils?.rotateVRM0) {
        try { VRMUtils.rotateVRM0(vrm); } catch {}
      }

      const root = vrm?.scene || gltf.scene;
      if (!root) throw new Error('Pink avatar file contains no renderable scene');
      scene.add(root);

      const runtime = new PinkModelRuntime({
        stage: targetStage,
        deps,
        gltf,
        vrm,
        config,
        format: normalizedFormat,
        url,
        canvas,
        renderer,
        scene,
        camera,
        root
      });

      targetStage.classList.add('pink-avatar-model-rendering');
      targetStage.dataset.avatarModelFormat = normalizedFormat;
      targetStage.dataset.avatarModelRig = vrm ? 'vrm' : runtime.bones.size ? 'generic-rig' : 'static-mesh';
      window.dispatchEvent(new CustomEvent('pinkavatar:adapter-model-loaded', {
        detail: runtime.snapshot()
      }));
      return runtime;
    } catch (error) {
      try { renderer?.dispose?.(); } catch {}
      canvas.remove();
      targetStage.classList.remove('pink-avatar-model-rendering');
      throw error;
    }
  }

  window.PinkAvatarModelAdapter = {
    load,
    version: '3.4.0',
    formats: ['glb', 'gltf', 'vrm']
  };

  window.dispatchEvent(new CustomEvent('pinkavatar:adapter-ready', {
    detail: { version: '3.4.0', formats: ['glb', 'gltf', 'vrm'] }
  }));
})();
