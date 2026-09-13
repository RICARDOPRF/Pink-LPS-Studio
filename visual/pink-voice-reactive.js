// Pink Phase 3.3.2 — spectrum-aware ElevenLabs output drives jaw + estimated visemes.
// ElevenLabs exposes output volume/frequency data, not phoneme events, so this is a visual estimator.
(() => {
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.PinkVoiceReactive) return;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
  const SAMPLE_INTERVAL_MS = 42; // ~24 FPS: fluid enough for lips and light enough for mobile.
  const OUTPUT_SAMPLE_RATE = 48000;
  const NYQUIST = OUTPUT_SAMPLE_RATE / 2;

  let raf = 0;
  let destroyed = false;
  let inFlight = false;
  let lastSampleAt = 0;
  let smoothedLevel = 0;
  let smoothedJaw = 0;
  let lastLevel = 0;
  let lastRawLevel = 0;
  let lastFrequencyEnergy = 0;
  let lastSource = 'synthetic';
  let lastViseme = 'sil';
  let lastConfidence = 0;
  let lastBands = null;
  let sampleCount = 0;
  let errorCount = 0;
  let issueReportedAt = 0;

  function avatarApi() { return window.PinkAvatar3D || null; }
  function voiceApi() { return window.PinkVoice || null; }

  function bandEnergy(data, minHz, maxHz) {
    if (!data || typeof data.length !== 'number' || !data.length) return 0;
    const hzPerBin = NYQUIST / data.length;
    let start = Math.max(1, Math.floor(minHz / hzPerBin));
    let end = Math.min(data.length, Math.ceil(maxHz / hzPerBin));
    if (start >= data.length) return 0;
    if (end <= start) end = Math.min(data.length, start + 1);
    let sum = 0;
    let count = 0;
    for (let index = start; index < end; index += 1) {
      const normalized = clamp(Number(data[index]) / 255);
      sum += normalized * normalized;
      count += 1;
    }
    return count ? clamp(Math.sqrt(sum / count)) : 0;
  }

  function spectrumFeatures(data) {
    const bands = {
      bass: bandEnergy(data, 80, 350),
      low: bandEnergy(data, 350, 900),
      mid: bandEnergy(data, 900, 1800),
      presence: bandEnergy(data, 1800, 3500),
      high: bandEnergy(data, 3500, 7000),
      air: bandEnergy(data, 7000, 10000)
    };
    const weighted = (
      bands.bass * .6 +
      bands.low * 1.0 +
      bands.mid * 1.1 +
      bands.presence * 1.0 +
      bands.high * .72 +
      bands.air * .35
    ) / 4.77;
    return { bands, speechEnergy: clamp(weighted * 1.6) };
  }

  function frequencyEnergy(data) {
    const features = spectrumFeatures(data);
    return features.speechEnergy;
  }

  function visualLevel(volume, frequencies) {
    const direct = clamp(volume);
    const spectral = frequencyEnergy(frequencies);
    lastRawLevel = direct;
    lastFrequencyEnergy = spectral;
    const combined = Math.max(direct, spectral);
    if (combined < .025) return 0;
    return clamp(Math.pow(combined, .78));
  }

  function estimateViseme(frequencies, level = 0) {
    const features = spectrumFeatures(frequencies);
    const { bands } = features;
    const loudness = clamp(level);
    const speech = Math.max(features.speechEnergy, loudness * .45);

    if (loudness < .035 && speech < .04) {
      return { viseme: 'sil', weight: 0, jaw: 0, confidence: 1, bands, speechEnergy: features.speechEnergy };
    }

    const scores = {
      aa: bands.mid * .88 + bands.presence * .52 + bands.low * .28 + loudness * .20,
      oh: bands.bass * .62 + bands.low * 1.05 + bands.mid * .28 - bands.high * .18,
      ee: bands.presence * 1.08 + bands.high * .56 + bands.mid * .36 - bands.bass * .10,
      uh: bands.low * .78 + bands.mid * .52 + bands.bass * .25 - bands.high * .16,
      fv: bands.high * 1.18 + bands.air * .62 + bands.presence * .42 - bands.low * .28
    };

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    let viseme = ranked[0][0];
    const best = ranked[0][1];
    const second = ranked[1]?.[1] ?? 0;
    let confidence = clamp(.42 + Math.max(0, best - second) * 1.8);

    if ((bands.high + bands.air * .65) > (bands.low + bands.mid) * 1.22 && bands.high > .08) {
      viseme = 'fv';
      confidence = Math.max(confidence, .72);
    } else if ((bands.bass * .7 + bands.low) > (bands.mid + bands.presence) * 1.16 && bands.low > .06) {
      viseme = 'oh';
      confidence = Math.max(confidence, .68);
    }

    const jawScale = { aa: 1, oh: .82, ee: .42, uh: .62, fv: .22, sil: 0 }[viseme] ?? .7;
    const widthScale = { aa: .96, oh: .78, ee: .72, uh: .70, fv: .55, sil: 0 }[viseme] ?? .75;
    const jaw = clamp(Math.max(.05, loudness) * 1.12 * jawScale);
    const weight = clamp(Math.max(.12, loudness) * widthScale + confidence * .18);

    return { viseme, weight, jaw, confidence, bands, speechEnergy: features.speechEnergy };
  }

  function releaseAvatarAudio(source = 'synthetic') {
    const avatar = avatarApi();
    const hadExternalAudio = lastSource === 'elevenlabs-output' || Boolean(avatar?.snapshot?.().externalVoiceFrame);
    if (avatar?.releaseVoiceFrame) {
      avatar.releaseVoiceFrame();
    } else {
      const internalAudio = avatar?.controller?.audio;
      if (internalAudio && (internalAudio.hasExternalLevel || internalAudio.externalViseme)) {
        internalAudio.externalLevel = 0;
        internalAudio.hasExternalLevel = false;
        internalAudio.externalViseme = null;
        internalAudio.visemes?.reset?.();
        avatar.controller?.animation?.schedule?.();
      }
    }
    smoothedLevel = 0;
    smoothedJaw = 0;
    lastLevel = 0;
    lastViseme = 'sil';
    lastConfidence = 0;
    if (lastSource !== source) {
      lastSource = source;
      stage.dataset.audioSource = source;
    }
    if (hadExternalAudio) stage.style.removeProperty('--pink-live-audio-level');
  }

  function applyFrame(frame) {
    const avatar = avatarApi();
    if (!avatar) return false;
    if (avatar.setVoiceFrame) {
      avatar.setVoiceFrame(frame);
    } else if (avatar.setAudioLevel) {
      avatar.setAudioLevel(frame.level);
      avatar.setViseme?.(frame.viseme, frame.weight, frame.jaw);
    } else {
      return false;
    }
    lastLevel = frame.level;
    lastViseme = frame.viseme;
    lastConfidence = frame.confidence;
    lastBands = frame.bands;
    lastSource = 'elevenlabs-output';
    stage.dataset.audioSource = lastSource;
    stage.dataset.audioViseme = frame.viseme;
    stage.style.setProperty('--pink-live-audio-level', frame.level.toFixed(3));
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

      const estimate = estimateViseme(frequencies, smoothedLevel);
      const jawAttack = estimate.jaw > smoothedJaw ? .62 : .34;
      smoothedJaw += (estimate.jaw - smoothedJaw) * jawAttack;
      if (smoothedJaw < .015) smoothedJaw = 0;

      const frame = {
        level: clamp(smoothedLevel),
        viseme: estimate.viseme,
        weight: estimate.weight,
        jaw: clamp(smoothedJaw),
        confidence: estimate.confidence,
        bands: estimate.bands
      };
      if (!applyFrame(frame)) releaseAvatarAudio('synthetic');
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
      viseme: lastViseme,
      confidence: Number(lastConfidence.toFixed(3)),
      bands: lastBands,
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
    delete stage.dataset.audioViseme;
  }

  window.PinkVoiceReactive = {
    start,
    sampleNow,
    snapshot,
    estimateViseme,
    spectrumFeatures,
    destroy
  };
  stage.dataset.audioSource = 'synthetic';
  start();
})();
