// Pink Phase 3.4 — GLB/GLTF/VRM avatar model adapter.
// Loads the definitive 3D Pink while preserving portrait fallback on any failure.
let THREE = null, GLTFLoader = null, VRMLoaderPlugin = null, VRMUtils = null;
async function loadThreeStackSafe() {
  const withTimeout = (promise, ms = 8000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('three.js stack load timeout')), ms))
  ]);
  try {
    THREE = await withTimeout(import('three'));
    const addons = await withTimeout(import('three/addons/loaders/GLTFLoader.js'));
    GLTFLoader = addons.GLTFLoader;
    const vrmModule = await withTimeout(import('@pixiv/three-vrm'));
    VRMLoaderPlugin = vrmModule.VRMLoaderPlugin;
    VRMUtils = vrmModule.VRMUtils;
  } catch (error) {
    THREE = null; GLTFLoader = null; VRMLoaderPlugin = null; VRMUtils = null;
    console.warn('Pink avatar model adapter: three.js/VRM stack unavailable; 3D avatar stays disabled and portrait fallback is used.', error);
  }
}
await loadThreeStackSafe();

const MODEL_HOST_SUFFIX = '.supabase.co';
const MAX_MODEL_BYTES = 55 * 1024 * 1024;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const DEFAULT_MORPHS = Object.freeze({
  aa: ['aa', 'visemeaa', 'visemea', 'mouthopen'],
  oh: ['oh', 'visemeoh', 'visemeo', 'mouthpucker'],
  ee: ['ee', 'visemeee', 'visemee', 'mouthsmile'],
  uh: ['ou', 'uh', 'visemeou', 'visemeu', 'mouthfunnel'],
  fv: ['fv', 'visemefv', 'visemeff', 'mouthpress'],
  blink: ['blink', 'eyeblink', 'eyeblinkleft', 'eyeblinkright', 'eyesclosed'],
  happy: ['happy', 'smile', 'mouthsmileleft', 'mouthsmileright'],
  sad: ['sad', 'frown', 'mouthfrownleft', 'mouthfrownright'],
  surprised: ['surprised', 'browinnerup'],
  relaxed: ['relaxed']
});

const VRM_MOUTH = Object.freeze({ aa: 'aa', oh: 'oh', ee: 'ee', uh: 'ou', fv: 'ih', sil: null });
const VRM_MOUTH_PRESETS = ['aa', 'ih', 'ou', 'ee', 'oh'];
const VRM_EMOTION_PRESETS = ['happy', 'sad', 'relaxed', 'surprised', 'angry', 'neutral'];
const EXPRESSION_TO_VRM = Object.freeze({
  neutral: null,
  attentive: ['relaxed', 0.08],
  thinking: ['relaxed', 0.04],
  focused: null,
  warm: ['happy', 0.16],
  confident: ['relaxed', 0.12],
  concerned: ['sad', 0.12]
});

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validateModelUrl(value) {
  const url = new URL(String(value || ''), window.location.href);
  const sameOrigin = url.origin === window.location.origin;
  const supabase = url.protocol === 'https:' && url.hostname.endsWith(MODEL_HOST_SUFFIX);
  if (!sameOrigin && !supabase) throw new Error(`Pink avatar model host is not allowed: ${url.hostname}`);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`Pink avatar model protocol is not allowed: ${url.protocol}`);
  if (url.protocol === 'http:' && !sameOrigin) throw new Error('Pink avatar model requires HTTPS');
  return url.href;
}

async function preflightModel(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return;
    const bytes = Number(response.headers.get('content-length') || 0);
    if (bytes > MAX_MODEL_BYTES) throw new Error(`Pink avatar model exceeds ${(MAX_MODEL_BYTES / 1024 / 1024).toFixed(0)} MB limit`);
  } catch (error) {
    if (/exceeds/.test(String(error?.message || error))) throw error;
    console.warn('Pink avatar preflight unavailable; continuing with loader.', error);
  }
}

function buildMorphIndex(root) {
  const index = new Map();
  root.traverse(object => {
    if (!object?.morphTargetDictionary || !Array.isArray(object.morphTargetInfluences)) return;
    for (const [name, targetIndex] of Object.entries(object.morphTargetDictionary)) {
      const key = normalizeName(name);
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ object, index: targetIndex, name });
    }
  });
  return index;
}

function resolveTargets(index, names = []) {
  const result = [];
  const seen = new Set();
  for (const name of names) {
    const key = normalizeName(name);
    const exact = index.get(key) || [];
    for (const target of exact) {
      const id = `${target.object.uuid}:${target.index}`;
      if (!seen.has(id)) { seen.add(id); result.push(target); }
    }
  }
  return result;
}

function buildMorphGroups(root, metadata) {
  const index = buildMorphIndex(root);
  const custom = safeObject(metadata?.morphMap);
  const groups = {};
  for (const [group, defaults] of Object.entries(DEFAULT_MORPHS)) {
    const configured = Array.isArray(custom[group]) ? custom[group] : (custom[group] ? [custom[group]] : []);
    groups[group] = resolveTargets(index, [...configured, ...defaults]);
  }
  return groups;
}

function setTargets(targets, weight) {
  const value = clamp(weight);
  for (const target of targets || []) {
    if (target.object?.morphTargetInfluences) target.object.morphTargetInfluences[target.index] = value;
  }
}

function findBone(root, customName, patterns) {
  let custom = null;
  let fallback = null;
  const customKey = normalizeName(customName);
  root.traverse(object => {
    if (!object?.isBone) return;
    const key = normalizeName(object.name);
    if (customKey && key === customKey) custom = object;
    if (!fallback && patterns.some(pattern => key.includes(pattern))) fallback = object;
  });
  return custom || fallback;
}

function captureRotation(object) {
  return object ? { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z } : null;
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose?.();
  }
  material.dispose?.();
}

class PinkLoadedAvatar {
  constructor({ stage, canvas, renderer, scene, camera, modelGroup, root, gltf, vrm, metadata }) {
    this.stage = stage;
    this.canvas = canvas;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.modelGroup = modelGroup;
    this.root = root;
    this.gltf = gltf;
    this.vrm = vrm;
    this.metadata = metadata;
    this.destroyed = false;
    this.blinkTimer = 0;
    this.state = stage.dataset.state || 'idle';
    this.expression = 'neutral';
    this.audioLevel = 0;
    this.morphGroups = buildMorphGroups(root, metadata);
    this.rig = this.resolveRig();
    this.mixer = this.createMixer();
    this.resizeObserver = new ResizeObserver(() => { this.resize(); this.render(); });
    this.resizeObserver.observe(stage);
    this.resize();
    this.render();
  }

  resolveRig() {
    const rigMeta = safeObject(this.metadata?.rig);
    const vrmHead = this.vrm?.humanoid?.getNormalizedBoneNode?.('head') || null;
    const vrmNeck = this.vrm?.humanoid?.getNormalizedBoneNode?.('neck') || null;
    const head = vrmHead || findBone(this.root, rigMeta.headBone, ['head']);
    const neck = vrmNeck || findBone(this.root, rigMeta.neckBone, ['neck']);
    const jaw = findBone(this.root, rigMeta.jawBone, ['lowerjaw', 'jawbone', 'jaw']);
    return {
      head, neck, jaw,
      headBase: captureRotation(head),
      neckBase: captureRotation(neck),
      jawBase: captureRotation(jaw),
      jawAxis: ['x','y','z'].includes(rigMeta.jawAxis) ? rigMeta.jawAxis : 'x',
      jawSign: Number(rigMeta.jawSign) === -1 ? -1 : 1,
      jawMax: Math.min(Math.max(Number(rigMeta.jawMaxRadians) || 0.18, 0.04), 0.42)
    };
  }

  createMixer() {
    if (!Array.isArray(this.gltf?.animations) || !this.gltf.animations.length) return null;
    const idleName = String(this.metadata?.idleAnimation || '').trim();
    const clip = (idleName && this.gltf.animations.find(item => item.name === idleName))
      || this.gltf.animations.find(item => /(^|\b)idle(\b|$)/i.test(item.name || ''));
    if (!clip) return null;
    const mixer = new THREE.AnimationMixer(this.root);
    mixer.clipAction(clip).reset().fadeIn(0.2).play();
    return mixer;
  }

  resize() {
    const rect = this.stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setState(state) {
    this.state = String(state || 'idle');
  }

  setExpression(expression = 'neutral') {
    this.expression = String(expression || 'neutral');
    const manager = this.vrm?.expressionManager;
    if (manager) {
      for (const name of VRM_EMOTION_PRESETS) if (manager.getExpression?.(name)) manager.setValue(name, 0);
      const mapped = EXPRESSION_TO_VRM[this.expression];
      if (mapped && manager.getExpression?.(mapped[0])) manager.setValue(mapped[0], mapped[1]);
      manager.update?.();
    }
    setTargets(this.morphGroups.happy, this.expression === 'warm' ? 0.18 : 0);
    setTargets(this.morphGroups.sad, this.expression === 'concerned' ? 0.14 : 0);
    setTargets(this.morphGroups.surprised, this.expression === 'attentive' ? 0.04 : 0);
    setTargets(this.morphGroups.relaxed, this.expression === 'confident' ? 0.08 : 0);
  }

  setViseme(viseme = 'sil', weight = 0, jaw = weight) {
    const key = String(viseme || 'sil').toLowerCase();
    const manager = this.vrm?.expressionManager;
    if (manager) {
      for (const name of VRM_MOUTH_PRESETS) if (manager.getExpression?.(name)) manager.setValue(name, 0);
      const mapped = VRM_MOUTH[key];
      if (mapped && manager.getExpression?.(mapped)) manager.setValue(mapped, clamp(weight));
      manager.update?.();
    }
    for (const group of ['aa','oh','ee','uh','fv']) setTargets(this.morphGroups[group], group === key ? weight : 0);
    this.setJaw(jaw);
  }

  setJaw(weight = 0) {
    const jaw = this.rig.jaw;
    const base = this.rig.jawBase;
    if (!jaw || !base) return;
    jaw.rotation.set(base.x, base.y, base.z);
    jaw.rotation[this.rig.jawAxis] += clamp(weight) * this.rig.jawMax * this.rig.jawSign;
  }

  setLook(x = 0, y = 0) {
    const px = Math.max(-1, Math.min(1, Number(x) || 0));
    const py = Math.max(-1, Math.min(1, Number(y) || 0));
    const head = this.rig.head;
    const neck = this.rig.neck;
    if (head && this.rig.headBase) {
      head.rotation.x = this.rig.headBase.x + py * 0.065;
      head.rotation.y = this.rig.headBase.y + px * 0.11;
      head.rotation.z = this.rig.headBase.z - px * 0.018;
    }
    if (neck && this.rig.neckBase) {
      neck.rotation.x = this.rig.neckBase.x + py * 0.022;
      neck.rotation.y = this.rig.neckBase.y + px * 0.035;
      neck.rotation.z = this.rig.neckBase.z - px * 0.008;
    }
  }

  blink() {
    clearTimeout(this.blinkTimer);
    const manager = this.vrm?.expressionManager;
    if (manager) {
      if (manager.getExpression?.('blink')) manager.setValue('blink', 1);
      else {
        if (manager.getExpression?.('blinkLeft')) manager.setValue('blinkLeft', 1);
        if (manager.getExpression?.('blinkRight')) manager.setValue('blinkRight', 1);
      }
      manager.update?.();
    }
    setTargets(this.morphGroups.blink, 1);
    this.render();
    this.blinkTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (manager?.getExpression?.('blink')) manager.setValue('blink', 0);
      if (manager?.getExpression?.('blinkLeft')) manager.setValue('blinkLeft', 0);
      if (manager?.getExpression?.('blinkRight')) manager.setValue('blinkRight', 0);
      manager?.update?.();
      setTargets(this.morphGroups.blink, 0);
      this.render();
    }, 105);
  }

  setAudioLevel(level = 0) {
    this.audioLevel = clamp(level);
  }

  update(frame = {}) {
    if (this.destroyed) return;
    const dt = Math.min(Math.max(Number(frame.dt) || 0, 0), 0.08);
    const elapsed = Number(frame.elapsed) || 0;
    this.mixer?.update(dt);
    this.vrm?.update?.(dt);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
    const stateFactor = this.state === 'speaking' ? 1 : this.state === 'thinking' ? 0.55 : 0.75;
    this.modelGroup.position.y = Math.sin(elapsed * 1.25) * 0.013 * stateFactor * motion;
    this.modelGroup.rotation.z = Math.sin(elapsed * 0.48) * 0.004 * motion;
    this.canvas.style.filter = `saturate(${(1.02 + this.audioLevel * 0.08).toFixed(3)}) brightness(${(1 + this.audioLevel * 0.035).toFixed(3)})`;
    this.render();
  }

  render() {
    if (!this.destroyed) this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.blinkTimer);
    this.resizeObserver.disconnect();
    this.mixer?.stopAllAction?.();
    this.root.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else disposeMaterial(object.material);
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.canvas.remove();
    delete this.stage.dataset.avatarFormat;
    delete this.stage.dataset.avatarEngine;
    delete this.stage.dataset.avatarVersion;
  }
}

function fitModel(root, modelGroup, camera, metadata) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) throw new Error('Pink avatar model has no renderable bounds');
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0.001) throw new Error('Pink avatar model has invalid dimensions');

  const targetHeight = Math.min(Math.max(Number(metadata?.targetHeight) || 3.75, 2.6), 5.2);
  const scale = targetHeight / size.y;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(root);
  const fittedCenter = fitted.getCenter(new THREE.Vector3());
  root.position.x -= fittedCenter.x;
  root.position.y -= fittedCenter.y - (Number(metadata?.verticalOffset) || 0.02);
  root.position.z -= fittedCenter.z;

  const fov = Math.min(Math.max(Number(metadata?.cameraFov) || 29, 20), 48);
  camera.fov = fov;
  const distance = Math.min(Math.max(Number(metadata?.cameraDistance) || 5.45, 3.2), 9.5);
  camera.position.set(Number(metadata?.cameraX) || 0, Number(metadata?.cameraY) || 0.05, distance);
  camera.lookAt(0, Number(metadata?.lookAtY) || 0.08, 0);
  camera.updateProjectionMatrix();
  modelGroup.position.set(0, 0, 0);
  modelGroup.rotation.y = Number(metadata?.modelYaw) || 0;

  return { sourceSize: size.toArray(), sourceCenter: center.toArray(), scale, distance, fov };
}

async function load({ stage, url, format, config = {} }) {
  if (!stage) throw new Error('Pink avatar stage is missing');
  if (!THREE || !GLTFLoader) throw new Error('Pink avatar 3D engine unavailable (three.js failed to load)');
  const modelUrl = validateModelUrl(url);
  const normalizedFormat = String(format || '').toLowerCase();
  if (!['glb', 'gltf', 'vrm'].includes(normalizedFormat)) throw new Error(`Unsupported Pink avatar format: ${normalizedFormat}`);
  await preflightModel(modelUrl);

  const metadata = safeObject(config.metadata || config.asset?.metadata);
  const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || /iPhone|iPad|Android/i.test(navigator.userAgent);
  const canvas = document.createElement('canvas');
  canvas.className = 'pink-avatar-model-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: lowPower ? 'low-power' : 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.2 : 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(29, 1, 0.05, 80);
  const modelGroup = new THREE.Group();
  scene.add(modelGroup);
  scene.add(new THREE.HemisphereLight(0xd8edff, 0x160d1b, 2.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(2.2, 3.5, 4.5); scene.add(key);
  const pink = new THREE.PointLight(0xff73bc, 10, 10); pink.position.set(-2.4, 1.2, 2.8); scene.add(pink);
  const blue = new THREE.PointLight(0x6edfff, 8, 10); blue.position.set(2.8, 1.8, 2.2); scene.add(blue);

  try {
    const loader = new GLTFLoader();
    if (normalizedFormat === 'vrm') loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(modelUrl);
    const vrm = gltf.userData?.vrm || null;
    if (vrm && VRMUtils?.rotateVRM0 && String(vrm.meta?.metaVersion || '') === '0') VRMUtils.rotateVRM0(vrm);
    const root = vrm?.scene || gltf.scene;
    if (!root) throw new Error('Pink avatar loader returned no scene');
    modelGroup.add(root);
    const fit = fitModel(root, modelGroup, camera, metadata);
    stage.dataset.avatarFormat = normalizedFormat;
    stage.dataset.avatarEngine = vrm ? 'three-vrm' : 'three-gltf';
    stage.dataset.avatarVersion = String(config.asset?.version || 'unknown');
    const controller = new PinkLoadedAvatar({ stage, canvas, renderer, scene, camera, modelGroup, root, gltf, vrm, metadata });
    window.dispatchEvent(new CustomEvent('pinkavatar:adapter-model-ready', { detail: { format: normalizedFormat, url: modelUrl, vrm: Boolean(vrm), fit } }));
    return controller;
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
    delete stage.dataset.avatarFormat;
    delete stage.dataset.avatarEngine;
    delete stage.dataset.avatarVersion;
    throw error;
  }
}

window.PinkAvatarModelAdapter = Object.freeze({
  version: '3.4.0',
  engine: 'three@0.180.0 + @pixiv/three-vrm@3.5.5',
  load
});
window.dispatchEvent(new CustomEvent('pinkavatar:adapter-ready', { detail: { version: '3.4.0' } }));
