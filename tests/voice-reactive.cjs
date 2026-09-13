const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'../visual/pink-voice-reactive.js'),'utf8');

class Style{
  constructor(){this.values=new Map()}
  setProperty(name,value){this.values.set(name,String(value))}
  removeProperty(name){this.values.delete(name)}
  getPropertyValue(name){return this.values.get(name)||''}
}

const stage={dataset:{state:'speaking'},style:new Style()};
const doc={hidden:false,querySelector:selector=>selector==='#pinkStage'?stage:null};
let rafSerial=0;
const rafQueue=new Map();
let lastAudioLevel=-1;
let animationSchedules=0;

const audio={externalLevel:0,hasExternalLevel:false,visemes:{reset(){this.resetCalled=true}}};
const avatar={
  controller:{audio,animation:{schedule(){animationSchedules+=1}}},
  setAudioLevel(level){lastAudioLevel=Number(level);audio.externalLevel=Number(level);audio.hasExternalLevel=true}
};
const conversation={
  getOutputVolume(){return .42},
  getOutputByteFrequencyData(){return new Uint8Array([18,35,64,92,128,170,210,160,98,44])}
};
const voice={mode:'elevenlabs',getConversation(){return conversation}};
const evolution={recordIssue(){throw new Error('unexpected issue report')}};
const win={PinkAvatar3D:avatar,PinkVoice:voice,PinkEvolution:evolution};

const context={
  window:win,
  document:doc,
  console,
  Math,
  Date,
  Promise,
  Uint8Array,
  setTimeout,
  clearTimeout,
  requestAnimationFrame:fn=>{const id=++rafSerial;rafQueue.set(id,fn);return id},
  cancelAnimationFrame:id=>rafQueue.delete(id)
};

vm.runInNewContext(source,context);
const api=win.PinkVoiceReactive;
assert.ok(api,'PinkVoiceReactive API should exist');

(async()=>{
  await api.sampleNow();
  const live=api.snapshot();
  assert.equal(live.source,'elevenlabs-output');
  assert.equal(live.active,true);
  assert.ok(lastAudioLevel>0,'real ElevenLabs output level should reach avatar');
  assert.equal(audio.hasExternalLevel,true);
  assert.ok(Number(stage.style.getPropertyValue('--pink-live-audio-level'))>0);

  voice.mode='fallback';
  await api.sampleNow();
  const fallback=api.snapshot();
  assert.equal(fallback.source,'fallback-synthetic');
  assert.equal(fallback.active,false);
  assert.equal(audio.hasExternalLevel,false,'fallback must release external ElevenLabs level');
  assert.ok(animationSchedules>0,'avatar animation should be rescheduled after release');

  stage.dataset.state='listening';
  voice.mode='elevenlabs';
  await api.sampleNow();
  assert.equal(api.snapshot().active,false,'sampler should not drive mouth while Pink is not speaking');

  api.destroy();
  assert.equal(stage.dataset.audioSource,undefined);
  console.log('PASS: real ElevenLabs audio drives lip sync and safely releases to fallback.');
})().catch(error=>{console.error(error);process.exitCode=1});
