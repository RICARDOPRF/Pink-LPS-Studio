'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const tts=fs.readFileSync('voice/pink-neural-tts.js','utf8');
const supervisor=fs.readFileSync('runtime/pink-supervisor-voice.js','utf8');
const settings=fs.readFileSync('voice/pink-voice-settings.js','utf8');

assert.match(tts,/async function unlock\(/,'unlock API missing');
assert.match(tts,/audio_context_blocked/,'blocked AudioContext guard missing');
assert.match(tts,/audio_playback_timeout/,'playback timeout missing');
assert.match(tts,/pointerdown/,'gesture unlock hook missing');
assert.match(tts,/touchend/,'touch unlock hook missing');
assert.match(tts,/version:'1\.2\.0'/,'neural TTS version not bumped');
assert.match(supervisor,/PinkNeuralTTS\?\.unlock/,'conversation start does not unlock neural audio');
assert.match(settings,/PinkNeuralTTS\?\.unlock/,'voice preview does not unlock neural audio');

const listeners=new Map();
class FakeAudioContext {
  constructor(){ this.state='suspended'; this.destination={}; }
  async resume(){ this.state='running'; }
  createBuffer(){ return {}; }
  createBufferSource(){ return {connect(){},start(){},stop(){}}; }
}
const document={
  addEventListener(type,fn){ listeners.set(type,fn); },
  removeEventListener(type,fn){ if(listeners.get(type)===fn) listeners.delete(type); }
};
const window={
  PinkPublicConfig:{voice:{voiceName:'Aoede'},supabase:{functions:{tts:'pink-tts'}}},
  AudioContext:FakeAudioContext
};
window.window=window;
const context=vm.createContext({
  window,document,console,atob:()=>'',fetch:async()=>{throw new Error('network must not be used by unlock test')},
  setTimeout,clearTimeout,Uint8Array,Float32Array,Math,Error,Object,String
});
vm.runInContext(tts,context,{filename:'voice/pink-neural-tts.js'});

assert.ok(listeners.has('pointerdown'),'pointer unlock listener not installed');
assert.ok(listeners.has('touchend'),'touch unlock listener not installed');
assert.ok(listeners.has('keydown'),'keyboard unlock listener not installed');

(async()=>{
  const before=window.PinkNeuralTTS.snapshot();
  assert.equal(before.audioContextState,'not-created');
  assert.equal(before.selectedVoice,'Aoede');
  assert.equal(before.endpoint,'pink-tts');

  const ok=await window.PinkNeuralTTS.unlock();
  assert.equal(ok,true,'unlock should succeed after AudioContext.resume');
  const after=window.PinkNeuralTTS.snapshot();
  assert.equal(after.audioContextState,'running');
  assert.equal(after.unlocked,true);
  assert.equal(after.selectedVoice,'Aoede','unlock must not change selected voice');
  assert.equal(after.endpoint,'pink-tts','unlock must not change TTS route');

  await listeners.get('pointerdown')?.();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(listeners.has('pointerdown'),false,'gesture listeners should self-remove');
  assert.equal(listeners.has('touchend'),false,'gesture listeners should self-remove together');
  assert.equal(listeners.has('keydown'),false,'gesture listeners should self-remove together');

  console.log('Pink iOS neural audio unlock contracts: PASS');
})().catch(error=>{ console.error(error); process.exitCode=1; });
