import * as THREE from 'three';

const stage = document.querySelector('#pinkStage');
if (!stage || window.PinkOrbConsole) {
  // no-op
} else {
  const STATE = {
    idle:{core:0xec4899,wire:0x38bdf8,particle:0xec4899,ring:0x38bdf8,speed:.006,pulse:1.8,scale:1},
    listening:{core:0x06b6d4,wire:0x67e8f9,particle:0x22d3ee,ring:0x38bdf8,speed:.015,pulse:4,scale:1.1},
    thinking:{core:0x9333ea,wire:0xc084fc,particle:0xa855f7,ring:0xc084fc,speed:.035,pulse:6,scale:.97},
    speaking:{core:0xf43f5e,wire:0xfb7185,particle:0xf43f5e,ring:0xfb7185,speed:.018,pulse:5,scale:1.08},
    executing:{core:0x10b981,wire:0x34d399,particle:0x10b981,ring:0x34d399,speed:.025,pulse:4.5,scale:1.04},
    error:{core:0xef4444,wire:0xf87171,particle:0xef4444,ring:0xf87171,speed:.008,pulse:5,scale:1},
    success:{core:0x10b981,wire:0x6ee7b7,particle:0x34d399,ring:0x6ee7b7,speed:.01,pulse:2.5,scale:1.04}
  };
  const stateLabel = {idle:'SISTEMA OPERACIONAL EM ESPERA',listening:'ESCUTANDO COMANDO DE VOZ...',thinking:'SUPERVISOR PROCESSANDO INTENÇÃO...',speaking:'PINK FALANDO',executing:'EXECUTANDO PIPELINE LPS...',error:'ALERTA NO PROCESSAMENTO',success:'PROCESSAMENTO CONCLUÍDO'};

  stage.classList.add('pink-orb-screen');
  stage.querySelectorAll('.portrait,.eyelid,.lip-sync,.voice-signature').forEach(el=>el.hidden=true);
  try { window.Pink3DPresence?.destroy?.(); } catch (_) {}

  const shell = document.createElement('div');
  shell.className = 'pink-orb-console';
  shell.innerHTML = `
    <div class="pink-orb-state"><span class="pink-orb-state-dot"></span><strong id="pinkOrbStateLabel">SISTEMA OPERACIONAL EM ESPERA</strong></div>
    <button type="button" class="pink-orb-stage-btn" id="pinkOrbStageBtn" aria-label="Falar com a Pink">
      <span class="pink-orb-canvas-wrap"><canvas id="pinkOrbCanvas" aria-hidden="true"></canvas></span>
      <span class="pink-orb-hint">CLIQUE NA ESFERA PARA FALAR</span>
    </button>
    <canvas id="pinkOrbWaveform" class="pink-orb-waveform" width="760" height="72" aria-hidden="true"></canvas>
    <div class="pink-orb-commandbar">
      <input id="pinkOrbTextInput" type="text" autocomplete="off" placeholder="Fale ou digite para a Pink..." aria-label="Mensagem para a Pink" />
      <button type="button" id="pinkOrbMicBtn" class="pink-orb-mic" aria-label="Ativar microfone">🎙️</button>
      <button type="button" id="pinkOrbSendBtn" class="pink-orb-send" aria-label="Enviar mensagem">➤</button>
    </div>`;
  stage.appendChild(shell);

  const canvas = shell.querySelector('#pinkOrbCanvas');
  const wrap = shell.querySelector('.pink-orb-canvas-wrap');
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45,1,.1,100);
  camera.position.z = 7;
  const group = new THREE.Group();
  scene.add(group);

  const coreGeo = new THREE.IcosahedronGeometry(1.32,3);
  const coreMat = new THREE.MeshStandardMaterial({color:0xec4899,roughness:.16,metalness:.72,emissive:0x7c1a55,emissiveIntensity:.95});
  const core = new THREE.Mesh(coreGeo,coreMat); group.add(core);
  const wireMat = new THREE.MeshBasicMaterial({color:0x38bdf8,wireframe:true,transparent:true,opacity:.28});
  const wire = new THREE.Mesh(coreGeo,wireMat); wire.scale.setScalar(1.012); group.add(wire);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(.9,28,28),new THREE.MeshBasicMaterial({color:0xf472b6,transparent:true,opacity:.34,blending:THREE.AdditiveBlending})); group.add(inner);
  const rings = [
    {r:2.15,t:.021,color:0x38bdf8,rot:[Math.PI/3,.1,.1]},
    {r:2.42,t:.018,color:0xf43f5e,rot:[-.62,.78,.15]},
    {r:2.68,t:.012,color:0x9333ea,rot:[.34,-.9,.55]}
  ].map((d,i)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(d.r,d.t,14,140),new THREE.MeshBasicMaterial({color:d.color,transparent:true,opacity:i===2?.35:.65,blending:THREE.AdditiveBlending}));m.rotation.set(...d.rot);group.add(m);return m;});
  const count = 1050;
  const positions = new Float32Array(count*3);
  const origins = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const u=Math.random(),v=Math.random(),theta=u*Math.PI*2,phi=Math.acos(2*v-1),r=2+Math.random()*2.05;
    const x=r*Math.sin(phi)*Math.cos(theta),y=r*Math.sin(phi)*Math.sin(theta),z=r*Math.cos(phi);
    positions.set([x,y,z],i*3);origins.set([x,y,z],i*3);
  }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const pMat = new THREE.PointsMaterial({size:.036,color:0xec4899,transparent:true,opacity:.74,depthWrite:false,blending:THREE.AdditiveBlending});
  const particles = new THREE.Points(pGeo,pMat); group.add(particles);
  scene.add(new THREE.AmbientLight(0xffffff,.55));
  const pinkLight = new THREE.PointLight(0xec4899,5,12);pinkLight.position.set(3,3,4);scene.add(pinkLight);
  const cyanLight = new THREE.PointLight(0x06b6d4,3.4,12);cyanLight.position.set(-3,-2,3);scene.add(cyanLight);

  const clock = new THREE.Clock();
  let raf=0,disposed=false;
  function currentState(){return stage.dataset.state||'idle'}
  function profile(){return STATE[currentState()]||STATE.idle}
  function resize(){const r=wrap.getBoundingClientRect();const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  function animate(){if(disposed)return;raf=requestAnimationFrame(animate);const t=clock.getElapsedTime(),p=profile();const speaking=currentState()==='speaking';const breath=Math.sin(t*p.pulse)*.075;const scale=(1+breath)*p.scale*(speaking?1+Math.sin(t*9)*.035:1);core.scale.setScalar(scale);wire.scale.setScalar(scale*1.012);inner.scale.setScalar(.94+Math.sin(t*p.pulse*1.2)*.08);core.rotation.y+=p.speed;core.rotation.x+=p.speed*.45;wire.rotation.y-=p.speed*.75;rings[0].rotation.z+=p.speed*1.45;rings[1].rotation.z-=p.speed*1.75;rings[2].rotation.y+=p.speed*.9;particles.rotation.y+=p.speed*.28;const attr=pGeo.attributes.position,arr=attr.array;for(let i=0;i<count;i++){const j=i*3,w=Math.sin(t*1.45+i)*.09;arr[j]=origins[j]*(1+w);arr[j+1]=origins[j+1]*(1+w);arr[j+2]=origins[j+2]*(1+w)}attr.needsUpdate=true;coreMat.color.lerp(new THREE.Color(p.core),.08);coreMat.emissive.lerp(new THREE.Color(p.core),.08);wireMat.color.lerp(new THREE.Color(p.wire),.08);pMat.color.lerp(new THREE.Color(p.particle),.08);pinkLight.color.lerp(new THREE.Color(p.core),.08);renderer.render(scene,camera)}
  resize();animate();
  const ro = new ResizeObserver(resize);ro.observe(wrap);

  const wave = shell.querySelector('#pinkOrbWaveform');
  const wctx = wave.getContext('2d');
  let wavePhase=0,waveRaf=0;
  function drawWave(){waveRaf=requestAnimationFrame(drawWave);wavePhase+=.075;const dpr=Math.min(window.devicePixelRatio||1,2);const cssW=wave.clientWidth||760,cssH=wave.clientHeight||72;if(wave.width!==Math.round(cssW*dpr)||wave.height!==Math.round(cssH*dpr)){wave.width=Math.round(cssW*dpr);wave.height=Math.round(cssH*dpr)}wctx.setTransform(dpr,0,0,dpr,0,0);wctx.clearRect(0,0,cssW,cssH);const bars=58,bw=cssW/bars,cy=cssH/2,s=currentState();for(let i=0;i<bars;i++){let amp=.12;if(s==='speaking')amp=.78+Math.sin(wavePhase*2+i*.3)*.2;else if(s==='listening')amp=.52+Math.sin(wavePhase*1.5+i*.42)*.28;else if(s==='thinking')amp=.32+Math.sin(wavePhase*3+i*.78)*.18;else if(s==='executing')amp=.42+Math.cos(wavePhase*2.4+i*.5)*.2;const center=1-Math.abs(i-bars/2)/(bars/2),h=Math.max(4,cssH*amp*center*.82),x=i*bw+bw*.2,y=cy-h/2;const g=wctx.createLinearGradient(0,y,0,y+h);if(s==='listening'){g.addColorStop(0,'#06b6d4');g.addColorStop(1,'#38bdf8')}else if(s==='thinking'){g.addColorStop(0,'#a855f7');g.addColorStop(1,'#6366f1')}else if(s==='executing'){g.addColorStop(0,'#10b981');g.addColorStop(1,'#34d399')}else{g.addColorStop(0,'#f43f5e');g.addColorStop(.5,'#fb7185');g.addColorStop(1,'#ec4899')}wctx.fillStyle=g;wctx.beginPath();wctx.roundRect(x,y,bw*.6,h,2);wctx.fill()}}
  drawWave();

  function syncState(){const s=currentState();const label=shell.querySelector('#pinkOrbStateLabel');if(label)label.textContent=stateLabel[s]||String(s).toUpperCase();shell.dataset.state=s;const mic=shell.querySelector('#pinkOrbMicBtn');if(mic)mic.textContent=window.PinkSupervisorVoice?.active?'■':'🎙️'}
  const mo = new MutationObserver(syncState);mo.observe(stage,{attributes:true,attributeFilter:['data-state']});syncState();

  async function toggleVoice(){const voice=window.PinkSupervisorVoice;if(!voice){stage.dataset.state='error';return}if(voice.active)voice.stop();else await voice.start();syncState()}
  async function sendText(){const input=shell.querySelector('#pinkOrbTextInput');const text=String(input?.value||'').trim();if(!text)return;if(input)input.value='';await window.PinkSupervisorVoice?.ask?.(text)}
  shell.querySelector('#pinkOrbStageBtn')?.addEventListener('click',toggleVoice);
  shell.querySelector('#pinkOrbMicBtn')?.addEventListener('click',toggleVoice);
  shell.querySelector('#pinkOrbSendBtn')?.addEventListener('click',sendText);
  shell.querySelector('#pinkOrbTextInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendText()}});

  function destroy(){disposed=true;cancelAnimationFrame(raf);cancelAnimationFrame(waveRaf);ro.disconnect();mo.disconnect();scene.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.()});renderer.dispose();shell.remove();stage.classList.remove('pink-orb-screen')}
  window.PinkOrbConsole={version:'1.0.0',destroy,snapshot:()=>({state:currentState(),voiceActive:Boolean(window.PinkSupervisorVoice?.active),ready:!disposed})};
  window.dispatchEvent(new CustomEvent('pinkorb:ready',{detail:window.PinkOrbConsole.snapshot()}));
}
