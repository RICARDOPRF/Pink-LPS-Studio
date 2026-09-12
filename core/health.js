(() => {
  'use strict';
  const checks=new Map();const register=(name,fn,severity='medium')=>checks.set(name,{fn,severity});
  const runOne=async(name,item)=>{const started=performance.now();try{const result=await item.fn();return{name,severity:item.severity,status:result===false?'fail':'pass',detail:typeof result==='string'?result:'',ms:Math.round(performance.now()-started)}}catch(error){return{name,severity:item.severity,status:'fail',detail:String(error?.message||error).slice(0,300),ms:Math.round(performance.now()-started)}}};
  const run=async()=>{const results=[];for(const[name,item]of checks)results.push(await runOne(name,item));const report={at:new Date().toISOString(),pass:results.filter(r=>r.status==='pass').length,fail:results.filter(r=>r.status==='fail').length,results};if(report.fail)window.PinkEvolution?.recordIssue?.('health-check',`${report.fail} checks failed`);window.dispatchEvent(new CustomEvent('pink:health',{detail:report}));return report};
  register('secure-context',()=>window.isSecureContext||location.hostname==='localhost','high');register('local-storage',()=>{const k='__pink_health__';localStorage.setItem(k,'1');localStorage.removeItem(k);return true},'medium');register('media-devices',()=>Boolean(navigator.mediaDevices?.getUserMedia),'high');register('websocket',()=>typeof WebSocket==='function','medium');register('custom-events',()=>typeof CustomEvent==='function','low');register('pink-evolution-core',()=>Boolean(window.PinkEvolution),'medium');
  window.PinkHealth={register,run};
})();
