// Pink HUD Layer V1 — original clean-room state-reactive canvas around the current Pink avatar.
(() => {
  const stage=document.querySelector('#pinkStage'); if(!stage || stage.querySelector('[data-pink-hud]')) return;
  const style=document.createElement('style');
  style.textContent=`#pinkStage{position:relative;overflow:hidden} .pink-hud-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;mix-blend-mode:screen}.pink-stage .portrait,.pink-stage img{position:relative;z-index:2}.pink-stage .state-pill,.pink-stage .voice-signature{z-index:3}`;
  document.head.appendChild(style);
  const canvas=document.createElement('canvas'); canvas.className='pink-hud-canvas'; canvas.dataset.pinkHud='1'; canvas.setAttribute('aria-hidden','true'); stage.prepend(canvas);
  const ctx=canvas.getContext('2d'); let w=0,h=0,dpr=1,t=0,last=performance.now(),particles=[];
  const palette={idle:[87,210,255],listening:[78,255,190],thinking:[167,112,255],speaking:[255,92,190],executing:[255,196,88],error:[255,82,82]};
  function state(){ return stage.dataset.state || 'idle'; }
  function resize(){ const r=stage.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2); w=Math.max(1,r.width);h=Math.max(1,r.height);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0); }
  function rgba(c,a){ return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function ring(cx,cy,r,start,len,width,color,alpha){ ctx.beginPath();ctx.strokeStyle=rgba(color,alpha);ctx.lineWidth=width;ctx.arc(cx,cy,r,start,start+len);ctx.stroke(); }
  function draw(ts){
    const dt=Math.min(50,ts-last); last=ts; t+=dt/1000; ctx.clearRect(0,0,w,h);
    const s=state(), c=palette[s]||palette.idle, cx=w/2,cy=h*.47,base=Math.min(w,h)*.31;
    const energy=s==='speaking'?1.35:s==='thinking'||s==='executing'?1.18:s==='listening'?1.08:s==='error'?1.25:1;
    const pulse=.5+.5*Math.sin(t*(s==='speaking'?5.2:2.2));
    const glow=ctx.createRadialGradient(cx,cy,base*.2,cx,cy,base*1.65);
    glow.addColorStop(0,rgba(c,.12+.08*pulse));glow.addColorStop(.5,rgba(c,.045));glow.addColorStop(1,rgba(c,0));
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,base*1.65,0,Math.PI*2);ctx.fill();
    for(let i=0;i<3;i++){
      const r=base*(1.05+i*.115)*energy;
      const dir=i%2? -1:1; const start=t*(.25+i*.12)*dir+i*2.1;
      ring(cx,cy,r,start,1.12+i*.14,1.2+i*.45,c,.22+.12*pulse);
      ring(cx,cy,r,start+Math.PI,0.58+i*.11,1,c,.12);
    }
    ctx.strokeStyle=rgba(c,.22);ctx.lineWidth=1;
    for(let deg=0;deg<360;deg+=12){
      const a=deg*Math.PI/180+t*.03,ro=base*1.43,ri=ro-(deg%36===0?12:6);
      ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*ri,cy+Math.sin(a)*ri);ctx.lineTo(cx+Math.cos(a)*ro,cy+Math.sin(a)*ro);ctx.stroke();
    }
    if(Math.random() < (s==='speaking'?.18:.035)){
      const a=Math.random()*Math.PI*2,r=base*(.55+Math.random()*.65);
      particles.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r,vx:Math.cos(a)*(10+Math.random()*24),vy:Math.sin(a)*(10+Math.random()*24),life:1});
    }
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.life-=dt/950;ctx.fillStyle=rgba(c,Math.max(0,p.life)*.65);ctx.beginPath();ctx.arc(p.x,p.y,1.5,0,Math.PI*2);ctx.fill();}
    requestAnimationFrame(draw);
  }
  new ResizeObserver(resize).observe(stage);resize();requestAnimationFrame(draw);
  window.PinkHUD={version:'1.0',destroy(){canvas.remove();style.remove();}};
})();
