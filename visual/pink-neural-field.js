// Pink Neural Field — original clean-room WebGL layer for Pink.
// Uses state-aware particles around the existing Pink avatar. No Jarvis source code copied.

const STATE = {
  idle:      { scale: 1.00, speed: 0.0012, point: 0x7bdcff, opacity: 0.42, halo: 0x5ca8ff },
  listening: { scale: 1.08, speed: 0.0020, point: 0x69f6ff, opacity: 0.72, halo: 0x40e8ff },
  thinking:  { scale: 0.90, speed: 0.0045, point: 0xb995ff, opacity: 0.78, halo: 0x9a67ff },
  speaking:  { scale: 1.14, speed: 0.0025, point: 0x7fffd4, opacity: 0.86, halo: 0x43ffc2 },
  executing: { scale: 0.96, speed: 0.0060, point: 0xff77d5, opacity: 0.86, halo: 0xff55c7 },
  reviewing: { scale: 0.92, speed: 0.0040, point: 0xa7b9ff, opacity: 0.75, halo: 0x7796ff },
  error:     { scale: 0.86, speed: 0.0010, point: 0xff7d96, opacity: 0.78, halo: 0xff506f }
};

async function boot() {
  const stage = document.querySelector('#pinkStage');
  if (!stage || document.querySelector('#pink-neural-field')) return;

  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');
  } catch (error) {
    console.warn('[Pink3D] Three.js unavailable; keeping 2D fallback.', error);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.id = 'pink-neural-field';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: '0', opacity: '1'
  });
  document.body.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  camera.position.set(0, 0, 42);

  const group = new THREE.Group();
  scene.add(group);

  const count = matchMedia('(max-width: 720px)').matches ? 520 : 900;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 10 + Math.pow(Math.random(), .65) * 13;
    positions[i*3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = radius * Math.cos(phi);
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: STATE.idle.point, size: .14, transparent: true, opacity: STATE.idle.opacity,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const cloud = new THREE.Points(geometry, material);
  group.add(cloud);

  // Original sparse constellation mesh: deterministic neighbor pairs, not copied.
  const maxSegments = Math.min(360, Math.floor(count / 2));
  const seg = new Float32Array(maxSegments * 6);
  for (let i = 0; i < maxSegments; i++) {
    const a = (i * 17) % count;
    const b = (a + 23 + (i % 31)) % count;
    seg.set(positions.slice(a*3, a*3+3), i*6);
    seg.set(positions.slice(b*3, b*3+3), i*6+3);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(seg, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: STATE.idle.halo, transparent: true, opacity: .055,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  const haloGeo = new THREE.RingGeometry(8.7, 9.05, 96);
  const haloMat = new THREE.MeshBasicMaterial({
    color: STATE.idle.halo, transparent: true, opacity: .08,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = Math.PI / 2.4;
  group.add(halo);

  let state = 'idle';
  let targetScale = 1;
  let scale = 1;
  let audioEnergy = 0;
  let last = performance.now();

  function stateName() {
    return stage.dataset.state || 'idle';
  }
  function updateState() {
    state = STATE[stateName()] ? stateName() : 'idle';
  }
  new MutationObserver(updateState).observe(stage, {attributes:true, attributeFilter:['data-state']});
  updateState();

  window.addEventListener('pink:voice-energy', (e) => {
    const v = Number(e.detail?.level ?? 0);
    audioEnergy = Math.max(0, Math.min(1, v));
  });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize, {passive:true});
  resize();

  function frame(now) {
    const dt = Math.min(32, now - last) / 16.667;
    last = now;
    const cfg = STATE[state];
    const speechPulse = state === 'speaking' ? audioEnergy * .16 : 0;
    targetScale = cfg.scale + speechPulse;
    scale += (targetScale - scale) * .055 * dt;
    group.scale.setScalar(scale);

    cloud.rotation.y += cfg.speed * dt;
    cloud.rotation.x += cfg.speed * .31 * dt;
    halo.rotation.z -= cfg.speed * 1.7 * dt;

    const targetColor = new THREE.Color(cfg.point);
    material.color.lerp(targetColor, .045 * dt);
    material.opacity += (cfg.opacity - material.opacity) * .05 * dt;
    material.size += ((.14 + speechPulse * .14) - material.size) * .08 * dt;
    lineMat.color.lerp(new THREE.Color(cfg.halo), .045 * dt);
    lineMat.opacity += (((state === 'thinking' || state === 'executing') ? .13 : .055) - lineMat.opacity) * .05 * dt;
    haloMat.color.lerp(new THREE.Color(cfg.halo), .045 * dt);
    haloMat.opacity += (((state === 'listening' || state === 'speaking') ? .16 : .08) - haloMat.opacity) * .04 * dt;

    const t = now * .0001;
    camera.position.x = Math.sin(t) * 1.3;
    camera.position.y = Math.cos(t * .83) * .8;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    audioEnergy *= .92;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.PinkNeuralField = { setState: (s) => { if (STATE[s]) { stage.dataset.state = s; updateState(); } } };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
else boot();
