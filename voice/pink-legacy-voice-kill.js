// Migration guard: keep the legacy app UI, but prevent its scheduled device/ElevenLabs runtime from remaining active.
(() => {
  const legacy=window.PinkVoice;
  if(!legacy)return;
  const stopLegacy=()=>{try{legacy.stop?.()}catch(_){} };
  // app.js schedules its legacy auto-start after window.load; stop it after those timers fire.
  window.addEventListener('load',()=>{setTimeout(stopLegacy,1100);setTimeout(stopLegacy,1800)},{once:true});
})();
