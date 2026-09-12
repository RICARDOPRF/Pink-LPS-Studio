// Pink Voice Watchdog — passive diagnostics. Never requests microphone permission by itself.
(() => {
  const state = { attached:false, level:0, lastSoundAt:0, lastTranscriptAt:0, lastAlertAt:0, stream:null, timer:null, context:null };
  const SPEECH = 0.018;
  const DEAF_MS = 4500;
  function emit(type, detail={}) { window.dispatchEvent(new CustomEvent(`pink:${type}`, {detail})); }
  async function attach(stream) {
    if (!stream || state.stream === stream) return;
    detach();
    state.stream = stream;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    state.context = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    state.attached = true;
    state.lastTranscriptAt = Date.now();
    state.timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) { const v=(sample-128)/128; sum += v*v; }
      const rms = Math.sqrt(sum / data.length);
      state.level = rms;
      if (rms > SPEECH) state.lastSoundAt = Date.now();
      emit('voice-energy', {level: Math.min(1, rms * 9)});
      const now = Date.now();
      if (state.lastSoundAt && now-state.lastSoundAt < 650 && now-state.lastTranscriptAt > DEAF_MS && now-state.lastAlertAt > 15000) {
        state.lastAlertAt = now;
        emit('voice-watchdog', {status:'recognizer-stalled', level:rms, silentTranscriptMs:now-state.lastTranscriptAt});
        window.PinkEvolution?.recordIssue?.('voice-recognizer-stalled', `mic level ${rms.toFixed(3)} without transcript`);
      }
    }, 180);
    emit('voice-watchdog', {status:'attached'});
  }
  function noteTranscript() { state.lastTranscriptAt = Date.now(); }
  function detach() {
    if (state.timer) clearInterval(state.timer);
    state.timer=null; state.attached=false; state.stream=null;
    try { state.context?.close?.(); } catch {}
    state.context=null;
  }
  function snapshot(){ return {attached:state.attached, level:state.level, lastSoundAt:state.lastSoundAt, lastTranscriptAt:state.lastTranscriptAt}; }
  window.PinkVoiceWatchdog={attach,noteTranscript,detach,snapshot};
})();
