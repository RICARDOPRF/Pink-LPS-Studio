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

function spectrumWithBand(minHz,maxHz,value=220,length=512){
  const arr=new Uint8Array(length);
  const hzPerBin=24000/length;
  const start=Math.max(1,Math.floor(minHz/hzPerBin));
  const end=Math.min(length,Math.ceil(maxHz/hzPerBin));
  for(let i=start;i<end;i++)arr[i]=value;
  return arr;
}
function mergeSpectra(...arrays){
  const out=new Uint8Array(arrays[0].length);
  for(const arr of arrays)for(let i=0;i<out.length;i++)out[i]=Math.max(out[i],arr[i]);
  return out;
}

const stage={dataset:{state:'speaking'},style:new Style()};
const doc={hidden:false,querySelector:selector=>selector==='#pinkStage'?stage:null};
let rafSerial=0;
const rafQueue=new Map();
let lastFrame=null;
let releases=0;

const avatar={
  setVoiceFrame(frame){lastFrame={...frame}},
  releaseVoiceFrame(){releases+=1;lastFrame=null;return true},
  snapshot(){return {externalVoiceFrame:Boolean(lastFrame)}}
};
let currentSpectrum=mergeSpectra(
  spectrumWithBand(350,900,205),
  spectrumWithBand(900,1800,225),
  spectrumWithBand(1800,3500,190)
);
const conversation={
  getOutputVolume(){return .48},
  getOutputByteFrequencyData(){return currentSpectrum}
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

const rounded=api.estimateViseme(
  mergeSpectra(spectrumWithBand(80,350,230),spectrumWithBand(350,900,240),spectrumWithBand(900,1800,70)),
  .5
);
assert.equal(rounded.viseme,'oh','low-frequency dominant frame should estimate rounded OH');

const fricative=api.estimateViseme(
  mergeSpectra(spectrumWithBand(1800,3500,90),spectrumWithBand(3500,7000,245),spectrumWithBand(7000,10000,220)),
  .38
);
assert.equal(fricative.viseme,'fv','high-frequency dominant frame should estimate FV-like mouth');

const silent=api.estimateViseme(new Uint8Array(512),0);
assert.equal(silent.viseme,'sil');
assert.equal(silent.jaw,0);

(async()=>{
  await api.sampleNow();
  const live=api.snapshot();
  assert.equal(live.source,'elevenlabs-output');
  assert.equal(live.active,true);
  assert.ok(lastFrame&&lastFrame.level>0,'real ElevenLabs output should create an avatar voice frame');
  assert.ok(lastFrame.viseme&&lastFrame.viseme!=='sil','voice frame should carry an estimated viseme');
  assert.ok(lastFrame.jaw>0,'voice frame should carry independent jaw motion');
  assert.ok(Number(stage.style.getPropertyValue('--pink-live-audio-level'))>0);

  voice.mode='fallback';
  await api.sampleNow();
  const fallback=api.snapshot();
  assert.equal(fallback.source,'fallback-synthetic');
  assert.equal(fallback.active,false);
  assert.ok(releases>0,'fallback must release the external ElevenLabs voice frame');

  stage.dataset.state='listening';
  voice.mode='elevenlabs';
  await api.sampleNow();
  assert.equal(api.snapshot().active,false,'sampler should not drive mouth while Pink is not speaking');

  api.destroy();
  assert.equal(stage.dataset.audioSource,undefined);
  assert.equal(stage.dataset.audioViseme,undefined);
  console.log('PASS: spectral viseme estimator, jaw frame and fallback release.');
})().catch(error=>{console.error(error);process.exitCode=1});
