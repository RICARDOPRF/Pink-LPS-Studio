(() => {
  'use strict';
  const cfg = window.PinkPublicConfig || {};
  const supabase = cfg.supabase || {};
  const FN = supabase.functions?.tts || 'pink-tts';
  let ctx = null, source = null, busy = false, unlocked = false, last = { provider:'gemini-tts', model:null, voice:cfg.voice?.voiceName || 'Aoede', error:null };

  function clean(input) {
    const base = window.PinkSpeechText?.clean ? window.PinkSpeechText.clean(input, 1800) : String(input || '').trim().slice(0, 1800);
    return String(base || '').trim();
  }
  function fromB64(value) {
    const raw = atob(String(value || '')), out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ctx = ctx || new Ctx({ sampleRate:24000 });
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') throw new Error('audio_context_blocked');
      const silent = ctx.createBuffer(1,1,24000);
      const src = ctx.createBufferSource(); src.buffer=silent; src.connect(ctx.destination); src.start(0);
      unlocked = ctx.state === 'running';
      return unlocked;
    } catch (_) { unlocked = false; return false; }
  }
  async function playPcm(audioBase64, sampleRate = 24000) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('audio_context_unavailable');
    ctx = ctx || new Ctx({ sampleRate });
    if (ctx.state === 'suspended') await ctx.resume();
    const bytes = fromB64(audioBase64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    return new Promise((resolve, reject) => {
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const timer = setTimeout(() => {
        try { source?.stop?.(); } catch (_) {}
        source = null;
        reject(new Error('audio_playback_timeout'));
      }, Math.max(5000, Math.ceil(buffer.duration*1000)+2500));
      source.onended = () => { clearTimeout(timer); source = null; resolve(true); };
      try { source.start(); } catch (error) { clearTimeout(timer); source = null; reject(error); }
    });
  }
  function preferredVoice(options={}) {
    return options.voice || window.PinkVoiceCatalog?.getPreference?.().voice || cfg.voice?.voiceName || 'Aoede';
  }
  async function speak(input, options = {}) {
    const text = clean(input);
    const voice = preferredVoice(options);
    if (!text) return { ok:false, skipped:true };
    if (!supabase.url || !supabase.anonKey) throw new Error('pink_tts_config_missing');
    if (busy) cancel();
    busy = true; last.error = null;
    window.dispatchEvent(new CustomEvent('pinktts:start', { detail:{ provider:'gemini-tts', voice } }));
    try {
      const response = await fetch(`${String(supabase.url).replace(/\/$/,'')}/functions/v1/${FN}`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          apikey:supabase.anonKey,
          Authorization:`Bearer ${supabase.anonKey}`,
        },
        body:JSON.stringify({ text, voice }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload?.audioBase64) {
        throw new Error(payload?.providerMessage || payload?.error || `pink_tts_http_${response.status}`);
      }
      last = { provider:'gemini-tts', model:payload.model || null, voice:payload.voice || 'Aoede', error:null };
      await playPcm(payload.audioBase64, Number(payload.sampleRate) || 24000);
      window.dispatchEvent(new CustomEvent('pinktts:end', { detail:{ ...last } }));
      return { ok:true, ...last };
    } catch (error) {
      last.error = String(error?.message || error);
      window.dispatchEvent(new CustomEvent('pinktts:error', { detail:{ ...last } }));
      throw error;
    } finally {
      busy = false;
    }
  }
  function cancel() {
    try { source?.stop?.(); } catch (_) {}
    source = null; busy = false;
  }
  function installUnlockGesture(){
    const once=()=>{unlock().finally(()=>{document.removeEventListener('pointerdown',once,true);document.removeEventListener('touchend',once,true);document.removeEventListener('keydown',once,true)})};
    document.addEventListener('pointerdown',once,true);document.addEventListener('touchend',once,true);document.addEventListener('keydown',once,true);
  }
  installUnlockGesture();
  window.PinkNeuralTTS = Object.freeze({
    version:'1.2.0', provider:'gemini-tts', speak, cancel, unlock,
    snapshot:()=>({ ...last, busy, unlocked, audioContextState:ctx?.state||'not-created', selectedVoice:preferredVoice(), endpoint:FN, fallback:'browser-speech-synthesis' })
  });
})();