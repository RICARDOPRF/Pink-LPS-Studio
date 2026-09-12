// Pink Preflight — read-only capability checks. It never changes browser/device settings.
(() => {
  function storageCheck(){
    try{const k='__pink_preflight__';localStorage.setItem(k,'1');localStorage.removeItem(k);return true}catch{return false}
  }
  function webglCheck(){
    try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch{return false}
  }
  async function run(){
    const checks=[
      ['secure-context', !!window.isSecureContext, 'HTTPS is required for reliable microphone access'],
      ['media-devices', !!navigator.mediaDevices?.getUserMedia, 'Microphone API unavailable'],
      ['audio-context', !!(window.AudioContext||window.webkitAudioContext), 'AudioContext unavailable'],
      ['webgl', webglCheck(), '3D acceleration unavailable; use visual fallback'],
      ['local-storage', storageCheck(), 'Local memory unavailable'],
      ['websocket', 'WebSocket' in window, 'Realtime transport unavailable'],
      ['service-worker', 'serviceWorker' in navigator, 'Offline/PWA features unavailable']
    ];
    const score=Math.round(checks.filter(x=>x[1]).length/checks.length*100);
    const report={at:new Date().toISOString(),score,checks:checks.map(([id,ok,remedy])=>({id,ok,remedy:ok?null:remedy}))};
    window.dispatchEvent(new CustomEvent('pink:preflight',{detail:report}));
    return report;
  }
  window.PinkPreflight={run};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>run(),{once:true});else run();
})();
