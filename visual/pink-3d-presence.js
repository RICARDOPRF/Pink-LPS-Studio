// Pink Phase 3 — real WebGL/Three.js presence layer
// Visual-only: no microphone, memory, auth, tool or production behavior is changed.
(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.Pink3DPresence) return;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fallbackProfile = () => {
    const reduced = motionQuery.matches;
    const low = (navigator.deviceMemory && navigator.deviceMemory <= 4) || /iPhone|iPad|Android/i.test(navigator.userAgent);
    return {
      tier: reduced ? 'eco' : low ? 'balanced' : 'cinematic',
      reducedMotion: reduced,
      targetFps: reduced ? 20 : low ? 30 : 60,
      presenceDpr: reduced ? 1 : low ? 1.25 : 1.7,
      antialias: !low && !reduced,
      powerPreference: low || reduced ? 'low-power' : 'high-performance',
      particles: reduced ? 180 : low ? 360 : 720,
      connections: reduced ? 24 : low ? 48 : 92,
      presenceMotionScale: reduced ? 0 : low ? .75 : 1
    };
  };
  const quality = () => window.PinkPerformance?.profile || fallbackProfile();
  const bootQuality = quality();
  let reducedMotion = Boolean(bootQuality.reducedMotion);
  const PARTICLES = bootQuality.particles;
  const CONNECTIONS = bootQuality.connections;

  const stateProfiles = {
    idle:      { speed:.16, pulse:.055, ring:.22, energy:.32, color:0x74dcff, accent:0xff6fba },
    listening: { speed:.34, pulse:.11,  ring:.44, energy:.68, color:0x60f0c4, accent:0x70dcff },
    thinking:  { speed:.52, pulse:.16,  ring:.72, energy:.82, color:0xc58cff, accent:0x66ddff },
    speaking:  { speed:.68, pulse:.23,  ring:.86, energy:1.0, color:0xff72bd, accent:0x78e9ff },
    executing: { speed:.82, pulse:.18,  ring:1.0, energy:.94, color:0x64dfff, accent:0xa37cff },
    reviewing: { speed:.24, pulse:.06, ring:.4, energy:.5, color:0xa8bfff, accent:0x70dcff },
    presenting:{ speed:.2, pulse:.05, ring:.35, energy:.45, color:0x74dcff, accent:0xff6fba },
    success:   { speed:.22, pulse:.07, ring:.4, energy:.55, color:0x60f0c4, accent:0x70dcff },
    error:     { speed:.12, pulse:.14,  ring:.36, energy:.54, color:0xff7d9b, accent:0xffb66c }
  };

  const runtime = {
    renderer:null, scene:null, camera:null, field:null, rings:[], nodes:null,
    state:stage.dataset.state || 'idle', running:!document.hidden, destroyed:false, raf:0, lastFrame:0, elapsed:0,
    pointer:{x:0,y:0}, fallback:false
  };

  function addFallback() {
    runtime.running = false;
    cancelAnimationFrame(runtime.raf);
    runtime.renderer?.domElement?.remove();
    stage.classList.remove('pink-3d-ready');
    runtime.fallback = true;
    stage.classList.add('pink-3d-fallback');
    if (!stage.querySelector('.pink-3d-fallback-ring')) {
      const ring = document.createElement('span');
      ring.className = 'pink-3d-fallback-ring';
      ring.setAttribute('aria-hidden','true');
      stage.prepend(ring);
    }
  }

  async function boot() {
    if (!('WebGLRenderingContext' in window)) return addFallback();
    let THREE;
    try { THREE = await import(THREE_URL); }
    catch (error) { console.warn('Pink 3D: Three.js unavailable', error); return addFallback(); }

    if(runtime.destroyed) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.className = 'pink-3d-presence-canvas';
      canvas.setAttribute('aria-hidden','true');
      canvas.addEventListener('webglcontextlost', onContextLost);
      stage.prepend(canvas);

      const q = quality();
      const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:Boolean(q.antialias), powerPreference:q.powerPreference || 'default'});
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.presenceDpr || 1.25));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, .1, 60);
      camera.position.set(0, 0, 7.2);

      const field = new THREE.Group();
      scene.add(field);

      const particleGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(PARTICLES * 3);
      for (let i=0;i<PARTICLES;i++) {
        const a = Math.random() * Math.PI * 2;
        const b = (Math.random() - .5) * Math.PI;
        const r = 2.25 + Math.random() * 2.4;
        const flatten = .78 + Math.random() * .3;
        pos[i*3] = Math.cos(a) * Math.cos(b) * r;
        pos[i*3+1] = Math.sin(b) * r * 1.18;
        pos[i*3+2] = Math.sin(a) * Math.cos(b) * r * flatten - .9;
      }
      particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const particleMat = new THREE.PointsMaterial({color:0x78dfff, size:q.tier === 'cinematic'?.033:.026, transparent:true, opacity:.46, depthWrite:false, blending:THREE.AdditiveBlending});
      const particles = new THREE.Points(particleGeo, particleMat);
      field.add(particles);

      const linePositions = new Float32Array(CONNECTIONS * 2 * 3);
      for (let i=0;i<CONNECTIONS;i++) {
        const p1 = Math.floor(Math.random()*PARTICLES)*3;
        const p2 = Math.floor(Math.random()*PARTICLES)*3;
        const o=i*6;
        linePositions[o]=pos[p1]; linePositions[o+1]=pos[p1+1]; linePositions[o+2]=pos[p1+2];
        linePositions[o+3]=pos[p2]; linePositions[o+4]=pos[p2+1]; linePositions[o+5]=pos[p2+2];
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions,3));
      const lineMat = new THREE.LineBasicMaterial({color:0x7bdfff, transparent:true, opacity:.075, blending:THREE.AdditiveBlending});
      const lines = new THREE.LineSegments(lineGeo,lineMat);
      field.add(lines);

      const ringDefs = [
        {r:2.72,t:.012,rx:1.18,ry:.18,rz:.05},
        {r:3.08,t:.009,rx:.86,ry:.42,rz:.34},
        {r:3.48,t:.007,rx:.42,ry:.74,rz:.14}
      ];
      const rings = ringDefs.map((d,i)=>{
        const g = new THREE.TorusGeometry(d.r,d.t,8,180);
        const m = new THREE.MeshBasicMaterial({color:i===1?0xff71bd:0x72dcff,transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending});
        const mesh = new THREE.Mesh(g,m);
        mesh.rotation.set(d.rx,d.ry,d.rz);
        mesh.userData={baseOpacity:m.opacity, phase:i*2.2, dir:i%2?-1:1};
        field.add(mesh); return mesh;
      });

      const nodeGeo = new THREE.IcosahedronGeometry(.055,1);
      const nodeMat = new THREE.MeshBasicMaterial({color:0xb7efff,transparent:true,opacity:.72,blending:THREE.AdditiveBlending});
      const nodes = new THREE.Group();
      for(let i=0;i<10;i++){
        const n = new THREE.Mesh(nodeGeo,nodeMat.clone());
        const a=(i/10)*Math.PI*2;
        n.position.set(Math.cos(a)*3.1, Math.sin(a*1.7)*1.3, Math.sin(a)*1.15-.7);
        n.userData={phase:i*.7}; nodes.add(n);
      }
      field.add(nodes);

      runtime.renderer=renderer; runtime.scene=scene; runtime.camera=camera; runtime.field=field;
      runtime.particles=particles; runtime.lines=lines; runtime.rings=rings; runtime.nodes=nodes;
      resize();
      schedule();
      stage.classList.add('pink-3d-ready');
      window.dispatchEvent(new CustomEvent('pink3d:ready',{detail:{particles:PARTICLES,quality:q.tier,reducedMotion}}));
    } catch (error) {
      console.warn('Pink 3D: WebGL initialization failed', error);
      addFallback();
    }
  }

  function profile(){ return stateProfiles[runtime.state] || stateProfiles.idle; }
  function setState(state){ if(stateProfiles[state]) {runtime.state=state; schedule();} }

  function resize(){
    if(!runtime.renderer||!runtime.camera) return;
    const r=stage.getBoundingClientRect();
    const w=Math.max(1,Math.round(r.width)), h=Math.max(1,Math.round(r.height));
    const q=quality();
    runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.presenceDpr || 1.25));
    runtime.renderer.setSize(w,h,false);
    runtime.camera.aspect=w/h; runtime.camera.updateProjectionMatrix();
    schedule();
  }

  function schedule(){
    if(runtime.raf || !runtime.running || !runtime.renderer || runtime.destroyed || runtime.fallback) return;
    runtime.raf=requestAnimationFrame(animate);
  }
  function animate(now){
    runtime.raf=0;
    if(!runtime.running||!runtime.renderer||runtime.destroyed||runtime.fallback) return;
    const q=quality();
    const interval=1000/Math.max(12,q.targetFps||30);
    if(!reducedMotion && runtime.lastFrame && now-runtime.lastFrame<interval){schedule();return;}
    const dt=runtime.lastFrame?Math.min((now-runtime.lastFrame)/1000,.1):0;
    runtime.lastFrame=now;
    if(!reducedMotion) runtime.elapsed+=dt;
    const t=runtime.elapsed, p=profile();
    const motion=reducedMotion?0:(q.presenceMotionScale ?? 1);
    runtime.field.rotation.y = t * .045 * p.speed * motion + runtime.pointer.x*.055*motion;
    runtime.field.rotation.x = Math.sin(t*.18)*.025*motion + runtime.pointer.y*.035*motion;
    const breathe = 1 + Math.sin(t*(.8+p.speed*.35))*p.pulse*motion;
    runtime.field.scale.setScalar(breathe);

    runtime.particles.material.color.setHex(p.color);
    runtime.particles.material.opacity=.25 + p.energy*.28;
    runtime.particles.rotation.z=t*.012*p.speed*motion;
    runtime.lines.material.color.setHex(p.accent);
    runtime.lines.material.opacity=.035 + p.energy*.065;

    runtime.rings.forEach((ring,i)=>{
      ring.rotation.z += .039 * dt * ring.userData.dir * p.speed * motion;
      ring.rotation.y += .018 * dt * (i+1) * p.speed * motion;
      ring.material.opacity = ring.userData.baseOpacity * (.55 + p.ring*.75) * (1 + Math.sin(t*1.1+ring.userData.phase)*.12);
      ring.material.color.setHex(i===1?p.accent:p.color);
    });
    runtime.nodes.children.forEach((n,i)=>{
      const s=1+Math.sin(t*(1.2+p.speed)+n.userData.phase)*.45*p.energy*motion;
      n.scale.setScalar(s); n.material.opacity=.34+p.energy*.48;
      n.material.color.setHex(i%3===0?p.accent:p.color);
    });

    runtime.camera.position.x += (((runtime.pointer.x*.18)*motion)-runtime.camera.position.x)*.025;
    runtime.camera.position.y += (((-runtime.pointer.y*.14)*motion)-runtime.camera.position.y)*.025;
    runtime.camera.lookAt(0,0,-.4);
    runtime.renderer.render(runtime.scene,runtime.camera);
    if(!reducedMotion) schedule();
  }

  const observer = new MutationObserver(()=>setState(stage.dataset.state||'idle'));
  observer.observe(stage,{attributes:true,attributeFilter:['data-state']});
  const ro = new ResizeObserver(resize); ro.observe(stage);
  function onPointerMove(e){
    if(reducedMotion) return;
    const r=stage.getBoundingClientRect();
    runtime.pointer.x=((e.clientX-r.left)/r.width-.5)*2;
    runtime.pointer.y=((e.clientY-r.top)/r.height-.5)*2;
  }
  function onPointerLeave(){runtime.pointer.x=0;runtime.pointer.y=0;}
  stage.addEventListener('pointermove',onPointerMove,{passive:true});
  stage.addEventListener('pointerleave',onPointerLeave,{passive:true});
  function onVisibility(){
    runtime.running=!document.hidden;
    runtime.lastFrame=0;
    cancelAnimationFrame(runtime.raf);runtime.raf=0;
    schedule();
  }
  function onMotion(){
    reducedMotion=quality().reducedMotion ?? motionQuery.matches;
    onPointerLeave();
    runtime.lastFrame=0;
    schedule();
  }
  function onQuality(){
    reducedMotion=Boolean(quality().reducedMotion);
    onPointerLeave();
    runtime.lastFrame=0;
    resize();
  }
  function onContextLost(event){event.preventDefault();addFallback();}
  document.addEventListener('visibilitychange',onVisibility);
  motionQuery.addEventListener('change',onMotion);
  window.addEventListener('pinkperformance:change',onQuality);
  function destroy(){
    runtime.destroyed=true;runtime.running=false;
    cancelAnimationFrame(runtime.raf);runtime.raf=0;
    observer.disconnect();ro.disconnect();
    document.removeEventListener('visibilitychange',onVisibility);
    motionQuery.removeEventListener('change',onMotion);
    window.removeEventListener('pinkperformance:change',onQuality);
    stage.removeEventListener('pointermove',onPointerMove);
    stage.removeEventListener('pointerleave',onPointerLeave);
    runtime.renderer?.domElement?.removeEventListener('webglcontextlost',onContextLost);
    const disposed=new Set();
    runtime.scene?.traverse(object=>{
      const resources=[object.geometry,...(Array.isArray(object.material)?object.material:[object.material])];
      for(const resource of resources){if(resource&&!disposed.has(resource)){resource.dispose();disposed.add(resource);}}
    });
    runtime.renderer?.dispose();runtime.renderer=null;
    stage.querySelector('.pink-3d-presence-canvas')?.remove();
    stage.querySelector('.pink-3d-fallback-ring')?.remove();
    stage.classList.remove('pink-3d-ready','pink-3d-fallback');
  }

  window.Pink3DPresence = {
    setState,
    snapshot:()=>({state:runtime.state,ready:!!runtime.renderer&&!runtime.fallback&&!runtime.destroyed,fallback:runtime.fallback,particles:PARTICLES,quality:quality().tier,reducedMotion}),
    destroy
  };
  boot();
})();
