(() => {
  'use strict';
  const cfg = window.PinkPublicConfig || {};
  const supabase = cfg.supabase || {};
  const FN = supabase.functions?.tts || 'pink-tts';
  let ctx = null, source = null, busy = false, last = { provider:'gemini-tts', model:null, voice:cfg.voice?.voiceName || 'Aoede', error:null };

  function clean(input) {
    const base = window.PinkSpeechText?.clean ? window.PinkSpeechText.clean(input, 1800) : String(input || '').trim().slice(0, 1800);
    return String(base || '').trim();
  }
  function fromB64(value) {
    const raw = atob(String(value || '')), out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
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
      source.onended = () => { source = null; resolve(true); };
      try { source.start(); } catch (error) { source = null; reject(error); }
    });
  }
  async function speak(input, options = {}) {
    const text = clean(input);
    if (!text) return { ok:false, skipped:true };
    if (!supabase.url || !supabase.anonKey) throw new Error('pink_tts_config_missing');
    if (busy) cancel();
    busy = true; last.error = null;
    window.dispatchEvent(new CustomEvent('pinktts:start', { detail:{ provider:'gemini-tts', voice:options.voice || cfg.voice?.voiceName || 'Aoede' } }));
    try {
      const response = await fetch(`${String(supabase.url).replace(/\/$/,'')}/functions/v1/${FN}`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          apikey:supabase.anonKey,
          Authorization:`Bearer ${supabase.anonKey}`,
        },
        body:JSON.stringify({ text, voice:options.voice || cfg.voice?.voiceName || 'Aoede' }),
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
  window.PinkNeuralTTS = Object.freeze({
    version:'1.0.0', provider:'gemini-tts', speak, cancel,
    snapshot:()=>({ ...last, busy, endpoint:FN, fallback:'browser-speech-synthesis' })
  });
})();