async function loadThreeSafe(){
  try{
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('three.js load timeout')),8000));
    return await Promise.race([import('three'),timeout]);
  }catch(error){
    console.warn('Pink orbital: three.js unavailable, using CSS fallback orb.',error);
    return null;
  }
}
const THREE = await loadThreeSafe();

const stage = document.querySelector('#pinkStage');
if (!stage || window.PinkOrbConsole) {
  // no-op
} else {
  const VERSION='1.3.0';
  const MP_VERSION='1.0.1';
  const MP_MODULE=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/+esm`;
  const MP_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
  const HAND_MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;
  const performanceProfile=window.PinkPerformance?.profile?.()||{tier:'balanced',maxFps:30,maxDpr:1.25};
  const STATE={
    idle:{core:0x37d8ff,wire:0x7de8ff,particle:0x5ee8ff,speed:.0038,pulse:1.3,scale:1},
    listening:{core:0x13e2c2,wire:0x71ffe8,particle:0x22d3ee,speed:.009,pulse:3.2,scale:1.04},
    thinking:{core:0xa855f7,wire:0xd8b4fe,particle:0xc084fc,speed:.017,pulse:4.4,scale:.99},
    speaking:{core:0xec4899,wire:0xff9bca,particle:0xff65b4,speed:.012,pulse:4.7,scale:1.04},
    executing:{core:0x38bdf8,wire:0x67e8f9,particle:0x818cf8,speed:.019,pulse:3.8,scale:1.02},
    error:{core:0xef4444,wire:0xfca5a5,particle:0xfb7185,speed:.005,pulse:4.5,scale:1},
    success:{core:0x10b981,wire:0x6ee7b7,particle:0x34d399,speed:.006,pulse:2.1,scale:1.03}
  };
  const stateLabel={idle:'PRONTA',listening:'OUVINDO',thinking:'PENSANDO',speaking:'FALANDO',executing:'EXECUTANDO',error:'ATENÇÃO',success:'CONCLUÍDO'};
  const currentState=()=>stage.dataset.state||'idle';
  const profile=()=>STATE[currentState()]||STATE.idle;

  stage.classList.add('pink-orb-screen');
  document.body.classList.add('pink-orbital-mode');
  stage.querySelectorAll('.portrait,.eyelid,.lip-sync,.voice-signature,.state-pill,.voice-pulse').forEach(el=>{el.hidden=true;el.setAttribute('aria-hidden','true')});
  try{window.Pink3DPresence?.destroy?.()}catch(_){}

  const shell=document.createElement('div');
  shell.className='pink-orb-console';
  shell.innerHTML=`
    <div class="pink-orb-statusbar" role="status" aria-live="polite">
      <div class="pink-orb-status-primary"><span class="pink-orb-state-dot" aria-hidden="true"></span><div class="pink-orb-status-copy"><small>PINK // LPS</small><strong id="pinkOrbStateLabel">PRONTA</strong></div></div>
      <div class="pink-orb-status-secondary"><div class="pink-orb-status-copy"><small>ORBITAL COMMAND CENTER</small><strong id="pinkOrbProjectStatus">Projetos LPS em órbita</strong></div></div>
    </div>
    <div class="pink-orb-stage-wrap" id="pinkOrbStageWrap">
      <div class="pink-orb-tick-ring pink-orb-tick-ring--outer" aria-hidden="true"></div>
      <div class="pink-orb-tick-ring pink-orb-tick-ring--inner" aria-hidden="true"></div>
      <div class="pink-orb-sweep" aria-hidden="true"></div>
      <div class="pink-orb-hud-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <button type="button" class="pink-orb-stage-btn" id="pinkOrbStageBtn" aria-label="Falar com a Pink">
        <span class="pink-orb-canvas-wrap"><canvas id="pinkOrbCanvas" aria-hidden="true"></canvas></span>
        <span class="pink-orb-core-badge"><b>LPS</b><small>LEAN PERFORMANCE SOLUTIONS</small></span>
        <span class="pink-orb-hint">TOQUE NO GLOBO PARA FALAR · APONTE PARA UM PROJETO</span>
      </button>
      <div class="pink-orbit-projects" id="pinkOrbitProjects" aria-label="Projetos LPS"></div>
      <button type="button" id="pinkOrbGestureBtn" class="pink-orb-gesture-btn" aria-pressed="false"><span>✋</span><b>Gestos</b><small>ativar câmera</small></button>
      <div id="pinkGestureCursor" class="pink-gesture-cursor" hidden aria-hidden="true"><i></i></div>
      <div id="pinkGestureNotice" class="pink-gesture-notice" hidden>Movimente a mão · una indicador + polegar para abrir</div>
    </div>
    <canvas id="pinkOrbWaveform" class="pink-orb-waveform" width="1200" height="72" aria-hidden="true"></canvas>
    <div class="pink-orb-commandbar">
      <input id="pinkOrbTextInput" type="text" autocomplete="off" placeholder="Fale ou digite para a Pink..." aria-label="Mensagem para a Pink" />
      <button type="button" id="pinkOrbMicBtn" class="pink-orb-mic" aria-label="Ativar microfone">🎙️</button>
      <button type="button" id="pinkOrbSendBtn" class="pink-orb-send" aria-label="Enviar mensagem">➤</button>
    </div>`;
  stage.appendChild(shell);

  const canvas=shell.querySelector('#pinkOrbCanvas');
  const wrap=shell.querySelector('.pink-orb-canvas-wrap');
  const stageWrap=shell.querySelector('#pinkOrbStageWrap');
  const projectHost=shell.querySelector('#pinkOrbitProjects');
  const gestureBtn=shell.querySelector('#pinkOrbGestureBtn');
  const gestureCursor=shell.querySelector('#pinkGestureCursor');
  const gestureNotice=shell.querySelector('#pinkGestureNotice');
  const projectStatus=shell.querySelector('#pinkOrbProjectStatus');
  let disposed=false,visualMode='fallback',disposeVisual=()=>{},visualTick=()=>{};
  let orbitCards=[],orbitStart=performance.now(),orbitPaused=false;
  const interaction={x:0,y:0,targetX:0,targetY:0,source:'pointer'};

  function safeProjects(){
    const source=Array.isArray(window.PinkCore?.projects)?window.PinkCore.projects:[];
    return source.filter(p=>p&&p.id&&p.name&&p.id!=='pink').slice(0,8);
  }
  function iconFor(id=''){
    if(/calculadora/.test(id))return '∑';
    if(/duo/.test(id))return '◫';
    if(/prospect/.test(id))return '⌁';
    if(/beccs|painel/.test(id))return '▥';
    if(/lps/.test(id))return 'LPS';
    return '◆';
  }
  function renderProjects(){
    const projects=safeProjects();projectHost.textContent='';orbitCards=[];
    projects.forEach((project,index)=>{
      const button=document.createElement('button');button.type='button';button.className='pink-orbit-card';button.dataset.orbitProject=project.id;button.dataset.orbitIndex=String(index);
      const icon=document.createElement('span');icon.className='pink-orbit-card-icon';icon.textContent=iconFor(project.id);
      const copy=document.createElement('span');copy.className='pink-orbit-card-copy';
      const small=document.createElement('small');small.textContent='PROJETO LPS';
      const strong=document.createElement('strong');strong.textContent=project.name;
      copy.append(small,strong);button.append(icon,copy);
      button.addEventListener('mouseenter',()=>{orbitPaused=true});button.addEventListener('mouseleave',()=>{orbitPaused=false});
      button.addEventListener('focus',()=>{orbitPaused=true});button.addEventListener('blur',()=>{orbitPaused=false});
      button.addEventListener('click',()=>{
        const opened=window.PinkCore?.openProject?.(project.id);
        if(opened){stage.dataset.state='executing';setTimeout(()=>{if(stage.dataset.state==='executing')stage.dataset.state='idle'},900);window.dispatchEvent(new CustomEvent('pinkorb:project-open',{detail:{id:project.id,name:project.name}}));}
      });
      projectHost.appendChild(button);orbitCards.push(button);
    });
    if(projectStatus)projectStatus.textContent=`${projects.length} projetos LPS em órbita`;
  }
  renderProjects();

  function layoutProjects(now=performance.now()){
    const n=orbitCards.length;if(!n)return;
    const t=(now-orbitStart)/1000*(reducedMotion?0:(gestureState.active?.045:.085));
    orbitCards.forEach((card,i)=>{
      const a=(i/n)*Math.PI*2+(orbitPaused?0:t);
      const depth=(Math.sin(a)+1)/2;
      const x=50+Math.cos(a)*39;
      const y=49+Math.sin(a)*22;
      const scale=.74+depth*.28;
      card.style.setProperty('--orbit-x',`${x.toFixed(2)}%`);
      card.style.setProperty('--orbit-y',`${y.toFixed(2)}%`);
      card.style.setProperty('--orbit-scale',scale.toFixed(3));
      card.style.setProperty('--orbit-opacity',(.58+depth*.42).toFixed(3));
      card.style.zIndex=String(18+Math.round(depth*18));
    });
  }

  function initWebGL(){
    let renderer=null,raf=0,ro=null,lastFrame=0;
    const maxFps=reducedMotion?12:Math.max(24,Math.min(60,Number(performanceProfile.maxFps)||30));
    try{
      if(!THREE)throw new Error('Three.js indisponível (offline ou bloqueado)');
      renderer=new THREE.WebGLRenderer({canvas,antialias:performanceProfile.tier==='high',alpha:true,powerPreference:performanceProfile.tier==='high'?'high-performance':'low-power'});
      renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,Number(performanceProfile.maxDpr)||1.25,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
      const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.z=7.1;
      const world=new THREE.Group(),globeGroup=new THREE.Group();scene.add(world);world.add(globeGroup);
      const globeGeo=new THREE.SphereGeometry(1.43,38,28);
      const globeMat=new THREE.MeshBasicMaterial({color:0x0a2849,transparent:true,opacity:.72});
      const globe=new THREE.Mesh(globeGeo,globeMat);globeGroup.add(globe);
      const wireMat=new THREE.MeshBasicMaterial({color:0x72e5ff,wireframe:true,transparent:true,opacity:.33,blending:THREE.AdditiveBlending});
      const wire=new THREE.Mesh(globeGeo,wireMat);wire.scale.setScalar(1.012);globeGroup.add(wire);
      const halo=new THREE.Mesh(new THREE.SphereGeometry(1.54,28,20),new THREE.MeshBasicMaterial({color:0x43d9ff,transparent:true,opacity:.075,blending:THREE.AdditiveBlending,depthWrite:false}));globeGroup.add(halo);
      const latitude=[];
      [-.95,-.5,0,.5,.95].forEach((offset,i)=>{const radius=Math.sqrt(Math.max(.1,1.43*1.43-offset*offset));const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.008,8,120),new THREE.MeshBasicMaterial({color:i===2?0xff6fba:0x67e8f9,transparent:true,opacity:i===2?.42:.24,blending:THREE.AdditiveBlending}));ring.rotation.x=Math.PI/2;ring.position.y=offset;globeGroup.add(ring);latitude.push(ring)});
      const orbits=[
        {r:2.18,t:.014,color:0x38bdf8,rot:[Math.PI/2.8,.12,.08]},
        {r:2.54,t:.012,color:0xec4899,rot:[-.62,.78,.15]},
        {r:2.92,t:.009,color:0x8b5cf6,rot:[.34,-.9,.55]}
      ].map((d,i)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(d.r,d.t,10,160),new THREE.MeshBasicMaterial({color:d.color,transparent:true,opacity:i===2?.32:.55,blending:THREE.AdditiveBlending,depthWrite:false}));m.rotation.set(...d.rot);world.add(m);return m});
      function buildDashedRing(radius,dashSize,gapSize,color,tiltX,tiltZ,opacity){
        const segments=128,points=[];
        for(let i=0;i<=segments;i++){const a=(i/segments)*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius))}
        const geo=new THREE.BufferGeometry().setFromPoints(points);
        const mat=new THREE.LineDashedMaterial({color,dashSize,gapSize,transparent:true,opacity});
        const loop=new THREE.LineLoop(geo,mat);loop.computeLineDistances();loop.rotation.set(tiltX,0,tiltZ);
        return loop;
      }
      const hudRingA=buildDashedRing(2.05,.16,.1,0x9be9ff,Math.PI/2.15,.22,.58);
      const hudRingB=buildDashedRing(2.3,.1,.16,0xff8fd1,Math.PI/2.4,-.4,.42);
      world.add(hudRingA,hudRingB);
      const count=performanceProfile.tier==='high'?720:420,positions=new Float32Array(count*3);
      for(let i=0;i<count;i++){const u=Math.random(),v=Math.random(),theta=u*Math.PI*2,phi=Math.acos(2*v-1),r=2.2+Math.random()*2.35;positions.set([r*Math.sin(phi)*Math.cos(theta),r*Math.sin(phi)*Math.sin(theta),r*Math.cos(phi)],i*3)}
      const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const pMat=new THREE.PointsMaterial({size:.032,color:0x68ddff,transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending});const particles=new THREE.Points(pGeo,pMat);world.add(particles);
      const nodeGeo=new THREE.IcosahedronGeometry(.048,1);const nodes=[];
      for(let i=0;i<10;i++){const node=new THREE.Mesh(nodeGeo,new THREE.MeshBasicMaterial({color:i%3===0?0xff78bd:0x91eaff,transparent:true,opacity:.82,blending:THREE.AdditiveBlending}));const a=i/10*Math.PI*2;node.position.set(Math.cos(a)*2.5,Math.sin(a*1.8)*1.05,Math.sin(a)*.9);world.add(node);nodes.push(node)}
      function resize(){const r=wrap.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
      function animate(now){
        if(disposed)return;raf=requestAnimationFrame(animate);if(document.hidden)return;
        if(lastFrame&&now-lastFrame<1000/maxFps)return;const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
        interaction.x+=(interaction.targetX-interaction.x)*.08;interaction.y+=(interaction.targetY-interaction.y)*.08;
        const t=now/1000,p=profile(),motion=reducedMotion?0:1,breath=1+Math.sin(t*p.pulse)*.025*motion;
        globeGroup.scale.setScalar(breath*p.scale);globeGroup.rotation.y+=p.speed*motion;globeGroup.rotation.x=Math.sin(t*.24)*.035*motion;
        world.rotation.y+=(interaction.x*.13-world.rotation.y)*.035;world.rotation.x+=(-interaction.y*.09-world.rotation.x)*.035;
        orbits[0].rotation.z+=p.speed*1.2*motion;orbits[1].rotation.z-=p.speed*1.45*motion;orbits[2].rotation.y+=p.speed*.72*motion;particles.rotation.y+=p.speed*.15*motion;
        hudRingA.rotation.y+=p.speed*1.9*motion;hudRingB.rotation.y-=p.speed*1.35*motion;
        latitude.forEach((ring,i)=>{ring.material.opacity=(i===2?.32:.16)+p.scale*.06});nodes.forEach((node,i)=>node.scale.setScalar(.8+Math.sin(t*1.5+i)*.28));
        wireMat.color.lerp(new THREE.Color(p.wire),.06);pMat.color.lerp(new THREE.Color(p.particle),.06);globeMat.color.lerp(new THREE.Color(p.core),.025);halo.material.color.lerp(new THREE.Color(p.core),.04);
        camera.position.x+=(interaction.x*.2-camera.position.x)*.035;camera.position.y+=(-interaction.y*.14-camera.position.y)*.035;camera.lookAt(0,0,0);
        layoutProjects(now);renderer.render(scene,camera);
      }
      resize();raf=requestAnimationFrame(animate);ro=new ResizeObserver(resize);ro.observe(wrap);visualMode='webgl';stage.dataset.orbVisual='webgl';shell.classList.add('is-webgl-ready');
      visualTick=layoutProjects;
      return()=>{cancelAnimationFrame(raf);ro?.disconnect();scene.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.()});renderer?.dispose?.()};
    }catch(error){
      try{renderer?.dispose?.()}catch(_){}visualMode='fallback';stage.dataset.orbVisual='fallback';shell.classList.add('is-webgl-fallback');wrap.innerHTML='<span class="pink-orb-fallback-orb" aria-hidden="true">LPS</span>';console.warn('Pink orbital WebGL fallback',error);try{window.PinkEvolution?.recordIssue?.('orb-webgl',error?.message||String(error))}catch(_){};
      const fallbackLoop=now=>{if(disposed)return;layoutProjects(now);requestAnimationFrame(fallbackLoop)};if(!reducedMotion)requestAnimationFrame(fallbackLoop);else layoutProjects();return()=>{};
    }
  }
  disposeVisual=initWebGL();

  function setInteraction(clientX,clientY,source='pointer'){
    const r=stageWrap.getBoundingClientRect();if(!r.width||!r.height)return;interaction.targetX=Math.max(-1,Math.min(1,((clientX-r.left)/r.width-.5)*2));interaction.targetY=Math.max(-1,Math.min(1,((clientY-r.top)/r.height-.5)*2));interaction.source=source;
  }
  stageWrap.addEventListener('pointermove',e=>{if(!gestureState.active)setInteraction(e.clientX,e.clientY,'pointer')},{passive:true});
  stageWrap.addEventListener('pointerleave',()=>{if(!gestureState.active){interaction.targetX=0;interaction.targetY=0}},{passive:true});

  const gestureState={active:false,status:'off',landmarker:null,raf:0,busy:false,lastDetect:0,pinching:false,lastClick:0,cameraStartedByGesture:false,hover:null,error:null};
  function setGestureUi(status,message=''){
    gestureState.status=status;const on=status==='active'||status==='loading';gestureBtn?.setAttribute('aria-pressed',gestureState.active?'true':'false');gestureBtn?.classList.toggle('is-active',gestureState.active);gestureBtn?.classList.toggle('is-loading',status==='loading');
    const small=gestureBtn?.querySelector('small');if(small)small.textContent=message||({off:'ativar câmera',loading:'carregando visão',active:'pinça para abrir',error:'indisponível'}[status]||status);
    if(gestureNotice)gestureNotice.hidden=!gestureState.active;if(gestureCursor)gestureCursor.hidden=!gestureState.active;
  }
  function clearGestureHover(){gestureState.hover?.classList?.remove('gesture-hover');gestureState.hover=null}
  function processHand(result){
    const lm=result?.landmarks?.[0];if(!lm||!lm[8]||!lm[4]){clearGestureHover();gestureState.pinching=false;if(gestureCursor)gestureCursor.classList.remove('is-pinching');return}
    const tip=lm[8],thumb=lm[4],x=Math.max(0,Math.min(1,1-tip.x)),y=Math.max(0,Math.min(1,tip.y));const r=stageWrap.getBoundingClientRect();const clientX=r.left+x*r.width,clientY=r.top+y*r.height;setInteraction(clientX,clientY,'camera');
    if(gestureCursor){gestureCursor.style.left=`${x*100}%`;gestureCursor.style.top=`${y*100}%`}
    const raw=document.elementFromPoint(clientX,clientY);const target=raw?.closest?.('.pink-orbit-card');const valid=target&&shell.contains(target)?target:null;if(valid!==gestureState.hover){clearGestureHover();gestureState.hover=valid;valid?.classList.add('gesture-hover')}
    const pinch=Math.hypot(tip.x-thumb.x,tip.y-thumb.y)<.055;gestureCursor?.classList.toggle('is-pinching',pinch);const now=performance.now();if(pinch&&!gestureState.pinching&&valid&&now-gestureState.lastClick>850){gestureState.lastClick=now;valid.click()}gestureState.pinching=pinch;
  }
  function gestureLoop(now){
    if(!gestureState.active||disposed)return;gestureState.raf=requestAnimationFrame(gestureLoop);if(gestureState.busy||now-gestureState.lastDetect<75)return;const video=document.querySelector('#pinkVisionCamera');if(!video||video.readyState<2)return;gestureState.lastDetect=now;gestureState.busy=true;
    try{Promise.resolve(gestureState.landmarker.detectForVideo(video,now)).then(processHand).catch(error=>{gestureState.error=String(error?.message||error)}).finally(()=>{gestureState.busy=false})}catch(error){gestureState.busy=false;gestureState.error=String(error?.message||error)}
  }
  async function ensureLandmarker(){
    if(gestureState.landmarker)return gestureState.landmarker;const mod=await import(MP_MODULE);const vision=await mod.FilesetResolver.forVisionTasks(MP_WASM);const options={baseOptions:{modelAssetPath:HAND_MODEL,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.5};
    try{gestureState.landmarker=await mod.HandLandmarker.createFromOptions(vision,options)}catch(_){options.baseOptions.delegate='CPU';gestureState.landmarker=await mod.HandLandmarker.createFromOptions(vision,options)}return gestureState.landmarker;
  }
  async function enableGestures(){
    if(gestureState.active)return true;setGestureUi('loading');gestureState.error=null;try{
      if(!window.PinkVision?.start)throw new Error('Pink Vision indisponível');const wasActive=Boolean(window.PinkVision.active);if(!wasActive){await window.PinkVision.start();gestureState.cameraStartedByGesture=true}await ensureLandmarker();gestureState.active=true;gestureState.pinching=false;gestureState.lastDetect=0;setGestureUi('active');gestureState.raf=requestAnimationFrame(gestureLoop);window.dispatchEvent(new CustomEvent('pinkorb:gesture-state',{detail:{active:true,processing:'on-device',version:MP_VERSION}}));return true;
    }catch(error){gestureState.active=false;gestureState.error=String(error?.message||error);setGestureUi('error');console.warn('Pink gesture control unavailable',error);if(gestureState.cameraStartedByGesture){window.PinkVision?.stop?.();gestureState.cameraStartedByGesture=false}return false}
  }
  function disableGestures({stopCamera=true}={}){
    gestureState.active=false;cancelAnimationFrame(gestureState.raf);gestureState.raf=0;clearGestureHover();gestureState.pinching=false;interaction.targetX=0;interaction.targetY=0;if(stopCamera&&gestureState.cameraStartedByGesture){window.PinkVision?.stop?.();gestureState.cameraStartedByGesture=false}setGestureUi('off');window.dispatchEvent(new CustomEvent('pinkorb:gesture-state',{detail:{active:false}}));
  }
  gestureBtn?.addEventListener('click',()=>gestureState.active?disableGestures():enableGestures());setGestureUi('off');

  const wave=shell.querySelector('#pinkOrbWaveform'),wctx=wave?.getContext?.('2d')||null;let wavePhase=0,waveRaf=0;
  function drawWave(){
    if(disposed||!wctx)return;waveRaf=requestAnimationFrame(drawWave);if(document.hidden)return;wavePhase+=.065;const dpr=Math.min(window.devicePixelRatio||1,2),cssW=wave.clientWidth||1200,cssH=wave.clientHeight||72;if(wave.width!==Math.round(cssW*dpr)||wave.height!==Math.round(cssH*dpr)){wave.width=Math.round(cssW*dpr);wave.height=Math.round(cssH*dpr)}wctx.setTransform(dpr,0,0,dpr,0,0);wctx.clearRect(0,0,cssW,cssH);const bars=Math.max(42,Math.min(88,Math.round(cssW/13))),bw=cssW/bars,cy=cssH/2,s=currentState();
    for(let i=0;i<bars;i++){let amp=.1;if(s==='speaking')amp=.72+Math.sin(wavePhase*2+i*.3)*.2;else if(s==='listening')amp=.5+Math.sin(wavePhase*1.5+i*.42)*.27;else if(s==='thinking')amp=.3+Math.sin(wavePhase*3+i*.78)*.17;else if(s==='executing')amp=.4+Math.cos(wavePhase*2.4+i*.5)*.19;const center=1-Math.abs(i-bars/2)/(bars/2),h=Math.max(3,cssH*amp*center*.82),x=i*bw+bw*.2,y=cy-h/2,g=wctx.createLinearGradient(0,y,0,y+h);if(s==='thinking'){g.addColorStop(0,'#c084fc');g.addColorStop(1,'#6366f1')}else if(s==='speaking'){g.addColorStop(0,'#ff72bd');g.addColorStop(1,'#38bdf8')}else{g.addColorStop(0,'#5ee8ff');g.addColorStop(1,'#2563eb')}wctx.fillStyle=g;wctx.beginPath();if(typeof wctx.roundRect==='function')wctx.roundRect(x,y,bw*.58,h,2);else wctx.rect(x,y,bw*.58,h);wctx.fill()}}
  drawWave();

  function syncState(){const s=currentState(),label=shell.querySelector('#pinkOrbStateLabel');if(label)label.textContent=stateLabel[s]||String(s).toUpperCase();shell.dataset.state=s;const mic=shell.querySelector('#pinkOrbMicBtn');if(mic)mic.textContent=window.PinkSupervisorVoice?.active?'■':'🎙️'}
  const mo=new MutationObserver(syncState);mo.observe(stage,{attributes:true,attributeFilter:['data-state']});syncState();
  async function toggleVoice(){const voice=window.PinkSupervisorVoice;if(!voice){stage.dataset.state='error';return}if(voice.active)voice.stop();else await voice.start();syncState()}
  async function sendText(){const input=shell.querySelector('#pinkOrbTextInput'),text=String(input?.value||'').trim();if(!text)return;if(input)input.value='';await window.PinkSupervisorVoice?.ask?.(text)}
  shell.querySelector('#pinkOrbStageBtn')?.addEventListener('click',toggleVoice);shell.querySelector('#pinkOrbMicBtn')?.addEventListener('click',toggleVoice);shell.querySelector('#pinkOrbSendBtn')?.addEventListener('click',sendText);shell.querySelector('#pinkOrbTextInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendText()}});

  function destroy(){disposed=true;cancelAnimationFrame(waveRaf);disableGestures({stopCamera:true});try{gestureState.landmarker?.close?.()}catch(_){}gestureState.landmarker=null;mo.disconnect();disposeVisual();shell.remove();stage.classList.remove('pink-orb-screen');document.body.classList.remove('pink-orbital-mode');delete stage.dataset.orbVisual}
  window.PinkOrbConsole={version:VERSION,destroy,enableGestures,disableGestures,snapshot:()=>({state:currentState(),voiceActive:Boolean(window.PinkSupervisorVoice?.active),ready:!disposed,visualMode,projectCount:orbitCards.length,gesture:{active:gestureState.active,status:gestureState.status,processing:'on-device',error:gestureState.error},performance:{tier:performanceProfile.tier,maxFps:performanceProfile.maxFps,maxDpr:performanceProfile.maxDpr},avatarRendered:false})};
  window.dispatchEvent(new CustomEvent('pinkorb:ready',{detail:window.PinkOrbConsole.snapshot()}));
}
