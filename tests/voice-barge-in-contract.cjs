'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const supervisor=fs.readFileSync('runtime/pink-supervisor-voice.js','utf8');

assert.match(supervisor,/function bargeIn\(\)/,'bargeIn function missing');
assert.match(supervisor,/if\(!speaking\)return false/,'bargeIn must no-op when Pink is not speaking');
assert.match(supervisor,/bargeIn[\s\S]{0,200}PinkNeuralTTS\?\.cancel\?\.\(\)/,'bargeIn must cancel neural TTS playback');
assert.match(supervisor,/bargeIn[\s\S]{0,260}speechSynthesis\?\.cancel\?\.\(\)/,'bargeIn must cancel browser speech synthesis fallback');
assert.match(supervisor,/recognition\.onspeechstart=\(\)=>\{if\(speaking\)bargeIn\(\)\}/,'speech recognition must trigger barge-in as soon as the user starts talking');
assert.doesNotMatch(supervisor,/speaking=true;try\{recognition\?\.stop\?\.\(\)\}/,'recognition must stay active while Pink speaks so it can detect a barge-in');
assert.match(supervisor,/recognition\.onend=\(\)=>\{if\(active\)setTimeout/,'recognition must keep restarting itself regardless of speaking state');
assert.match(supervisor,/window\.PinkSupervisorVoice=\{start,stop,ask:handle,askBrain,bargeIn,/,'bargeIn must be exposed on the public Supervisor Voice API');
console.log('Pink voice barge-in contract: PASS');
