// Pink Phase 3.3 — real ElevenLabs output drives avatar lip sync.
// The bridge is additive: voice keeps working if visual sampling is unavailable.
(() => {
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.PinkVoiceReactive) return;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
  const SAMPLE_INTERVAL_MS = 42; // ~24 FPS is enough for mouth motion and lighter on mobile.

  let raf = 0;
  let destroyed = false;
  let inFlight = false;
  let lastSampleAt = 0;
  let smoothedLevel = 0;
  let lastLevel = 0;
  let lastRawLevel = 0;
  let lastFrequencyEnergy = 0;
  let lastSource = 'synthetic';
  let sampleCount = 0;
  let errorCount = 0;
  let issueReportedAt = 0;

  function avatarApi() { return window.PinkAvatar3D || null; }
  function voiceApi() { return window.PinkVoice || null; }

  function frequencyEnergy(data) {
    if (!data || typeof data.length !== 'number' || !data.length) return 0;
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = clamp(Number(data[index]) / 255);
      sum += normalized * normalized;
    }
    return clamp(Math.sqrt(sum / data.length) * 1.18);
  }

  function visualLevel(volume, frequencies) {
    const direct = clamp(volume);
    const spectral = frequencyEnergy(frequencies);
    lastRawLevel = direct;
    lastFrequencyEnergy = spectral;
    const combined = Math.max(direct, spectral);
    if (combined < .025) return 0;
    // Gentle lift makes quiet syllables visible without clipping louder speech.
    return clamp(Math.pow(combined, .78));
  }

  function releaseAvatarAudio(source = 'synthetic') {
    const avatar = avatarApi();
    const internalAudio = avatar?.controller?.audio;
    if (internalAudio) {
      internalAudio.externalLevel = 0;
      internalAudio.hasExternalLevel = false;
      internalAudio.visemes?.reset?.();
      avatar.controller?.animation?.schedule?.();
    }
    smoothedLevel = 0;
    lastLevel = 0;
    lastSource = source;
    stage.dataset.audioSource = source;
    stage.style.removeProperty('--pink-live-audio-level');
  }

  function applyLevel(level) {
    const avatar = avatarApi();
    if (!avatar?.setAudioLevel) return false;
    avatar.setAudioLevel(level);
    lastLevel = level;
    lastSource = 'elevenlabs-output';
    stage.dataset.audioSource = lastSource;
    stage.style.setProperty('--pink-live-audio-level', level.toFixed(3));
    return true;
  }

  async function readConversationOutput(conversation) {
    const volumePromise = typeof conversation?.getOutputVolume === 'function'
      ? Promise.resolve(conversation.getOutputVolume()).catch(() => 0)
      : Promise.resolve(0);
    const frequencyPromise = typeof conversation?.getOutputByteFrequencyData === 'function'
      ? Promise.resolve(conversation.getOutputByteFrequencyData()).catch(() => null)
      : Promise.resolve(null);
    const [volume, frequencies] = await Promise.all([volumePromise, frequencyPromise]);
    return { volume, frequencies };
  }

  async function sampleNow() {
    if (destroyed || inFlight) return snapshot();
    const voice = voiceApi();
    const avatar = avatarApi();
    const mode = String(voice?.mode || 'idle');
    const speaking = stage.dataset.state === 'speaking';
    const conversation = voice?.getConversation?.() || null;

    if (!avatar || mode !== 'elevenlabs' || !speaking || !conversation) {
      releaseAvatarAudio(mode === 'fallback' ? 'fallback-synthetic' : 'synthetic');
      return snapshot();
    }

    inFlight = true;
    try {
      const { volume, frequencies } = await readConversationOutput(conversation);
      const target = visualLevel(volume, frequencies);
      const attack = target > smoothedLevel ? .58 : .28;
      smoothedLevel += (target - smoothedLevel) * attack;
      if (smoothedLevel < .018) smoothedLevel = 0;
      applyLevel(clamp(smoothedLevel));
      sampleCount += 1;
      errorCount = 0;
    } catch (error) {
      errorCount += 1;
      releaseAvatarAudio('synthetic');
      const now = Date.now();
      if (errorCount >= 3 && now - issueReportedAt > 15000) {
        issueReportedAt = now;
        window.PinkEvolution?.recordIssue?.('voice-reactive-sampler', error?.message || error);
      }
    } finally {
      inFlight = false;
    }
    return snapshot();
  }

  function tick(now) {
    raf = 0;
    if (destroyed) return;
    if (!document.hidden && now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
      lastSampleAt = now;
      sampleNow();
    }
    raf = requestAnimationFrame(tick);
  }

  function snapshot() {
    return {
      source: lastSource,
      level: Number(lastLevel.toFixed(3)),
      rawLevel: Number(lastRawLevel.toFixed(3)),
      frequencyEnergy: Number(lastFrequencyEnergy.toFixed(3)),
      samples: sampleCount,
      errors: errorCount,
      active: lastSource === 'elevenlabs-output'
    };
  }

  function start() {
    if (destroyed || raf) return;
    raf = requestAnimationFrame(tick);
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    raf = 0;
    releaseAvatarAudio('destroyed');
    delete stage.dataset.audioSource;
  }

  window.PinkVoiceReactive = { start, sampleNow, snapshot, destroy };
  stage.dataset.audioSource = 'synthetic';
  start();
})();
