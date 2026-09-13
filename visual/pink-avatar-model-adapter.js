// Pink Phase 3.4 — real GLB/GLTF/VRM model adapter.
// Loads the definitive Pink avatar into an isolated Three.js canvas and maps
// Pink runtime states, look, visemes, blink, jaw and expressions to real 3D controls.
(() => {
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.PinkAvatarModelAdapter) return;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
  const normalizeKey = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const BONE_ALIASES = Object.freeze({
    head: ['head', 'headbone', 'jhead'],
    neck: ['neck', 'neck1', 'jneck'],
    chest: ['chest', 'upperchest', 'spine2', 'spine03', 'jchest'],
    spine: ['spine', 'spine1', 'spine01', 'spine02'],
    jaw: ['jaw', 'jawbone', 'lowerjaw', 'mandible'],
    leftEye: ['lefteye', 'eyeleft', 'eyel', 'jeyel'],
    rightEye: ['righteye', 'eyeright', 'eyer', 'jeyer']
  });

  const MORPH_ALIASES = Object.freeze({
    blink: ['blink', 'eyesclosed', 'eyeclose', 'blinkboth'],
    blinkLeft: ['blinkleft', 'eyecloseleft', 'leftblink', 'eyelclose'],
    blinkRight: ['blinkright', 'eyecloseright', 'rightblink', 'eyerclose'],
    aa: ['aa', 'a', 'moutha', 'visemeaa', 'visemea'],
    oh: ['oh', 'o', 'moutho', 'visemeoh', 'visemeo'],
    ee: ['ee', 'i', 'ih', 'mouthi', 'visemeee', 'visemei'],
    uh: ['uh', 'u', 'ou', 'mouthu', 'visemeuh', 'visemeu'],
    fv: ['fv', 'f', 'v', 'mouthf', 'visemefv'],
    happy: ['happy', 'smile', 'joy'],
    sad: ['sad', 'sorrow'],
    surprised: ['surprised', 'surprise'],
    angry: ['angry', 'anger'],
    relaxed: ['relaxed', 'relax']
  });

  const VRM_VISEME_MAP = Object.freeze({
    aa: ['aa'],
    oh: ['oh', 'ou'],
    ee: ['ee', 'ih'],
    uh: ['ou', 'oh'],
    fv: []
  });

  const EXPRESSION_MAP = Object.freeze({
    neutral: [],
    attentive: [['relaxed', .08]],
    thinking: [['relaxed', .05]],
    focused: [],
    warm: [['happy', .16]],
    confident: [['happy', .10]],
    concerned: [['sad', .14]]
  });

  function findByAliases(map, aliases = []) {
    for (const alias of aliases) {
      const exact = map.get(normalizeKey(alias));
      if (exact) return exact;
    }
    for (const alias of aliases) {
      const needle = normalizeKey(alias);
      if (!needle) continue;
      for (const [key, value] of map.entries()) {
        if (key.includes(needle) || needle.includes(key)) return value;
      }
    }
    return null;
  }

  function collectSceneCapabilities(root, vrm = null) {
    const boneNames = new Map();
    const morphNames = new Map();
    let skinnedMeshes = 0;
    let meshes = 0;

    root?.traverse?.(node => {
      const key = normalizeKey(node?.name);
      if (key && (node?.isBone || /bone|head|neck|spine|jaw|eye/.test(key))) boneNames.set(key, node);
      if (node?.isSkinnedMesh) skinnedMeshes += 1;
      if (node?.isMesh) meshes += 1;
      const dict = node?.morphTargetDictionary;
      const influences = node?.morphTargetInfluences;
      if (dict && influences) {
        for (const [name, index] of Object.entries(dict)) {
          const normalized = normalizeKey(name);
          if (!normalized) continue;
          const entry = { mesh: node, index: Number(index), name };
          if (!morphNames.has(normalized)) morphNames.set(normalized, []);
          morphNames.get(normalized).push(entry);
        }
      }
    });

    const bones = {};
    for (const [role, aliases] of Object.entries(BONE_ALIASES)) bones[role] = findByAliases(boneNames, aliases);

    const morphs = {};
    for (const [role, aliases] of Object.entries(MORPH_ALIASES)) {
      const found = findByAliases(morphNames, aliases);
      morphs[role] = found || [];
    }

    const vrmExpressions = vrm?.expressionManager?.expressionMap
      ? Object.keys(vrm.expressionManager.expressionMap)
      : [];

    const hasFaceRig = Boolean(
      vrm?.expressionManager ||
      morphs.blink.length || morphs.aa.length || morphs.oh.length || morphs.ee.length || morphs.uh.length || morphs.fv.length
    );
    const hasHumanoidRig = Boolean(vrm?.humanoid || bones.head || bones.neck || bones.chest || skinnedMeshes);

    return {
      bones,
      morphs,
      boneNames,
      morphNames,
      vrmExpressions,
      meshes,
      skinnedMeshes,
      hasFaceRig,
      hasHumanoidRig,
      rigLevel: hasFaceRig && hasHumanoidRig ? 'facial-humanoid' : hasHumanoidRig ? 'humanoid' : hasFaceRig ? 'facial' : 'static'
    };
  }

  function createModelController({ THREE, renderer, scene, camera, root, gltf, vrm, canvas, stage: modelStage, capabilities, resizeObserver }) {
    const clock = new THREE.Clock();
    const mixer = gltf?.animations?.length ? new THREE.AnimationMixer(root) : null;
    let destroyed = false;
    let currentExpression = 'neutral';
    let currentViseme = 'sil';
    let currentJaw = 0;
    let currentLook = { x: 0, y: 0 };
    let blinkTimer = 0;

    const baseRotations = new Map();
    const basePositions = new Map();
    for (const bone of Object.values(capabilities.bones)) {
      if (!bone || baseRotations.has(bone)) continue;
      baseRotations.set(bone, { x: bone.rotation?.x || 0, y: bone.rotation?.y || 0, z: bone.rotation?.z || 0 });
      basePositions.set(bone, { x: bone.position?.x || 0, y: bone.position?.y || 0, z: bone.position?.z || 0 });
    }

    if (mixer && gltf.animations.length) {
      const preferred = gltf.animations.find(clip => /idle|breath|stand/i.test(clip.name || '')) || gltf.animations[0];
      mixer.clipAction(preferred)?.play?.();
    }

    const setMorphEntries = (entries, value) => {
      for (const entry of entries || []) {
        if (!entry?.mesh?.morphTargetInfluences || !Number.isInteger(entry.index)) continue;
        entry.mesh.morphTargetInfluences[entry.index] = clamp(value);
      }
    };

    const resetMorphGroup = roles => {
      for (const role of roles) setMorphEntries(capabilities.morphs[role], 0);
    };

    const setVrmExpression = (name, value) => {
      const manager = vrm?.expressionManager;
      if (!manager?.getExpression?.(name)) return false;
      manager.setValue(name, clamp(value));
      return true;
    };

    const clearVrmMouth = () => {
      for (const name of ['aa', 'ih', 'ou', 'ee', 'oh']) setVrmExpression(name, 0);
    };

    const clearVrmEmotion = () => {
      for (const name of ['happy', 'sad', 'relaxed', 'angry', 'surprised']) setVrmExpression(name, 0);
    };

    const setExpression = expression => {
      currentExpression = String(expression || 'neutral');
      clearVrmEmotion();
      resetMorphGroup(['happy', 'sad', 'surprised', 'angry', 'relaxed']);
      for (const [name, value] of EXPRESSION_MAP[currentExpression] || []) {
        if (!setVrmExpression(name, value)) setMorphEntries(capabilities.morphs[name], value);
      }
    };

    const setJaw = value => {
      currentJaw = clamp(value);
      const jaw = capabilities.bones.jaw;
      if (!jaw?.rotation) return;
      const base = baseRotations.get(jaw) || { x: 0, y: 0, z: 0 };
      jaw.rotation.x = base.x + currentJaw * .34;
    };

    const setViseme = (viseme = 'sil', weight = 0, jaw = weight) => {
      currentViseme = String(viseme || 'sil').toLowerCase();
      currentJaw = clamp(jaw);
      clearVrmMouth();
      resetMorphGroup(['aa', 'oh', 'ee', 'uh', 'fv']);
      if (currentViseme !== 'sil') {
        let handled = false;
        for (const name of VRM_VISEME_MAP[currentViseme] || []) {
          if (setVrmExpression(name, weight)) { handled = true; break; }
        }
        if (!handled) setMorphEntries(capabilities.morphs[currentViseme], weight);
      }
      setJaw(currentJaw);
    };

    const setLook = (x = 0, y = 0) => {
      currentLook = { x: Math.max(-1, Math.min(1, Number(x) || 0)), y: Math.max(-1, Math.min(1, Number(y) || 0)) };
      if (vrm?.lookAt) {
        const head = vrm?.humanoid?.getNormalizedBoneNode?.('head') || capabilities.bones.head;
        if (head?.rotation) {
          head.rotation.y = currentLook.x * .16;
          head.rotation.x = currentLook.y * .09;
        }
        return;
      }
      const head = capabilities.bones.head || capabilities.bones.neck;
      if (!head?.rotation) return;
      const base = baseRotations.get(head) || { x: 0, y: 0, z: 0 };
      head.rotation.y = base.y + currentLook.x * .16;
      head.rotation.x = base.x + currentLook.y * .09;
      head.rotation.z = base.z + currentLook.x * .018;
    };

    const blink = () => {
      clearTimeout(blinkTimer);
      const manager = vrm?.expressionManager;
      if (manager?.getExpression?.('blink')) manager.setValue('blink', 1);
      else {
        setMorphEntries(capabilities.morphs.blink, 1);
        setMorphEntries(capabilities.morphs.blinkLeft, 1);
        setMorphEntries(capabilities.morphs.blinkRight, 1);
      }
      blinkTimer = setTimeout(() => {
        if (destroyed) return;
        if (manager?.getExpression?.('blink')) manager.setValue('blink', 0);
        else {
          setMorphEntries(capabilities.morphs.blink, 0);
          setMorphEntries(capabilities.morphs.blinkLeft, 0);
          setMorphEntries(capabilities.morphs.blinkRight, 0);
        }
      }, 105);
    };

    const setState = (state, profile = {}) => {
      modelStage.dataset.avatarModelState = String(state || 'idle');
      if (profile.expression) setExpression(profile.expression);
    };

    const setAudioLevel = level => {
      modelStage.style.setProperty('--pink-model-audio', clamp(level).toFixed(3));
    };

    const update = frame => {
      if (destroyed) return;
      const dt = Math.min(Number(frame?.dt) || clock.getDelta() || 0, .08);
      mixer?.update?.(dt);
      vrm?.update?.(dt);

      const chest = capabilities.bones.chest || capabilities.bones.spine;
      if (chest?.position && !mixer) {
        const base = basePositions.get(chest) || { x: 0, y: 0, z: 0 };
        const breathe = Math.sin((Number(frame?.elapsed) || 0) * 2.2) * .0025;
        chest.position.y = base.y + breathe;
      }

      vrm?.expressionManager?.update?.();
      renderer.render(scene, camera);
    };

    const snapshot = () => ({
      rigLevel: capabilities.rigLevel,
      hasFaceRig: capabilities.hasFaceRig,
      hasHumanoidRig: capabilities.hasHumanoidRig,
      meshes: capabilities.meshes,
      skinnedMeshes: capabilities.skinnedMeshes,
      vrm: Boolean(vrm),
      expression: currentExpression,
      viseme: currentViseme,
      jaw: currentJaw,
      look: { ...currentLook }
    });

    const disposeMaterial = material => {
      if (!material) return;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose?.();
      material.dispose?.();
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(blinkTimer);
      resizeObserver?.disconnect?.();
      mixer?.stopAllAction?.();
      scene.traverse?.(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
        else disposeMaterial(object.material);
      });
      renderer.dispose?.();
      canvas.remove?.();
      delete modelStage.dataset.avatarRig;
      delete modelStage.dataset.avatarFormat;
      delete modelStage.dataset.avatarModelVersion;
      delete modelStage.dataset.avatarModelState;
      modelStage.style.removeProperty('--pink-model-audio');
    };

    setExpression('neutral');
    renderer.render(scene, camera);
    return { setState, setExpression, setViseme, setJaw, setLook, blink, setAudioLevel, update, snapshot, destroy };
  }

  async function load({ stage: modelStage = stage, url, format, config = {} } = {}) {
    if (!url) throw new Error('Pink avatar adapter requires a model URL');
    const normalizedFormat = String(format || url.split('.').pop() || '').toLowerCase();
    if (!['glb', 'gltf', 'vrm'].includes(normalizedFormat)) throw new Error(`Unsupported Pink avatar format: ${normalizedFormat || 'unknown'}`);
    if (!('WebGLRenderingContext' in window)) throw new Error('WebGL is unavailable for Pink avatar model');

    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
    let vrmModule = null;

    const canvas = document.createElement('canvas');
    canvas.className = 'pink-avatar-model-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    modelStage.prepend(canvas);

    let renderer;
    let resizeObserver;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !(navigator.deviceMemory && navigator.deviceMemory <= 4),
        powerPreference: /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'low-power' : 'high-performance'
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
      const hemi = new THREE.HemisphereLight(0xbfeaff, 0x171122, 2.15);
      const key = new THREE.DirectionalLight(0xffffff, 2.45);
      key.position.set(2.4, 3.8, 4.8);
      const rim = new THREE.DirectionalLight(0xff6fba, 1.7);
      rim.position.set(-3.2, 2.0, -1.8);
      scene.add(hemi, key, rim);

      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/');
      loader.setDRACOLoader(draco);

      if (normalizedFormat === 'vrm') {
        vrmModule = await import('@pixiv/three-vrm');
        loader.register(parser => new vrmModule.VRMLoaderPlugin(parser));
      }

      const gltf = await loader.loadAsync(url);
      const vrm = gltf?.userData?.vrm || null;
      if (vrm && vrmModule?.VRMUtils) vrmModule.VRMUtils.rotateVRM0(vrm);
      const root = vrm?.scene || gltf?.scene;
      if (!root) throw new Error('Pink avatar file contains no renderable scene');
      scene.add(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Pink avatar model has invalid dimensions');

      root.position.sub(center);
      const normalizedBox = new THREE.Box3().setFromObject(root);
      const normalizedSize = normalizedBox.getSize(new THREE.Vector3());
      const portraitScale = Number(config?.metadata?.scale || config?.asset?.metadata?.scale || 1);
      const targetHeight = 3.15 * Math.max(.4, Math.min(2.4, portraitScale));
      root.scale.multiplyScalar(targetHeight / Math.max(normalizedSize.y, .001));

      const framedBox = new THREE.Box3().setFromObject(root);
      const framedSize = framedBox.getSize(new THREE.Vector3());
      const framedCenter = framedBox.getCenter(new THREE.Vector3());
      const fitHeight = Math.max(framedSize.y, framedSize.x * 1.08);
      const fovRad = THREE.MathUtils.degToRad(camera.fov);
      camera.position.set(0, framedCenter.y + framedSize.y * .02, fitHeight / (2 * Math.tan(fovRad / 2)) * 1.08);
      camera.lookAt(framedCenter.x, framedCenter.y + framedSize.y * .02, framedCenter.z);

      const resize = () => {
        const rect = modelStage.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(modelStage);
      resize();

      const capabilities = collectSceneCapabilities(root, vrm);
      modelStage.dataset.avatarRig = capabilities.rigLevel;
      modelStage.dataset.avatarFormat = normalizedFormat;
      modelStage.dataset.avatarModelVersion = String(config?.asset?.version || config?.metadata?.version || 'unknown');

      const controller = createModelController({
        THREE, renderer, scene, camera, root, gltf, vrm, canvas,
        stage: modelStage, capabilities, resizeObserver
      });
      window.dispatchEvent(new CustomEvent('pinkavatar:model-capabilities', { detail: controller.snapshot() }));
      return controller;
    } catch (error) {
      resizeObserver?.disconnect?.();
      renderer?.dispose?.();
      canvas.remove();
      throw error;
    }
  }

  window.PinkAvatarModelAdapter = {
    load,
    inspectScene: collectSceneCapabilities,
    normalizeKey,
    versions: Object.freeze({ three: '0.180.0', threeVrm: '3.5.3' })
  };

  window.dispatchEvent(new CustomEvent('pinkavatar:adapter-ready', {
    detail: { three: '0.180.0', threeVrm: '3.5.3', formats: ['glb', 'gltf', 'vrm'] }
  }));
})();
