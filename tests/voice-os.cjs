'use strict';
const assert = require('node:assert');
const voice = require('../voice/pink-voice-os.js');

(async () => {
  assert.strictEqual(voice.version,'2.0.0');
  assert.strictEqual(voice.classifyError(new Error('This request exceeds your quota limit')),'quota');
  assert.strictEqual(voice.classifyError(Object.assign(new Error('Permission denied'),{name:'NotAllowedError'})),'microphone_permission');
  assert.strictEqual(voice.classifyError(new Error('WebRTC network disconnected')),'network');
  assert.strictEqual(voice.classifyError(new Error('voice_connection_timeout')),'timeout');

  const machine=new voice.VoiceStateMachine();
  machine.set('connecting');machine.set('listening');machine.set('thinking');machine.set('speaking');machine.set('listening');
  assert.strictEqual(machine.snapshot().state,'listening');
  assert.throws(()=>machine.set('fallback'),/invalid_voice_transition/);

  let mode='idle';
  let primaryStarts=0;
  let primaryStops=0;
  let fallbackStarts=0;
  let micMuted=null;
  let activities=0;
  let interrupts=0;
  const conversation={
    setMicMuted(value){micMuted=value},
    sendUserActivity(){activities+=1},
    async interrupt(){interrupts+=1}
  };
  const primary={
    async start(){primaryStarts+=1;mode='elevenlabs';return true},
    async stop(){primaryStops+=1;mode='idle'},
    getConversation(){return conversation},
    mode(){return mode},
    canSpeak(){return true}
  };
  const fallback={async start(){fallbackStarts+=1;mode='fallback';return true}};
  const environment={
    mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})},
    SpeechRecognition:function(){},speechSynthesis:{cancel(){}},userAgent:'Mozilla/5.0 Chrome',platform:'Linux',maxTouchPoints:0
  };
  const os=new voice.VoiceOS({primary,fallback,environment,timeoutMs:600,maxRecoveries:2});
  assert.strictEqual(os.capabilities().canListen,true);
  assert.strictEqual(os.capabilities().canSpeak,true);
  assert.strictEqual(await os.start({userGesture:true}),true);
  assert.strictEqual(os.snapshot().state,'listening');
  assert.strictEqual(primaryStarts,1);
  assert.strictEqual(os.setMicMuted(true),true);
  assert.strictEqual(micMuted,true);
  assert.strictEqual(os.userActivity(),true);
  assert.strictEqual(activities,1);
  assert.strictEqual(await os.bargeIn(),'interrupt');
  assert.strictEqual(interrupts,1);
  os.syncStageState('thinking');os.syncStageState('speaking');os.syncStageState('listening');
  assert.strictEqual(os.snapshot().state,'listening');
  assert.strictEqual(os.snapshot().echoGuard.speaking,false);
  await os.stop();
  assert.strictEqual(primaryStops,1);
  assert.strictEqual(os.snapshot().state,'idle');

  // Quota/provider failure immediately activates browser fallback.
  let quotaMode='idle';
  const quotaOS=new voice.VoiceOS({
    primary:{
      async start(){throw new Error('429 quota exceeded')},async stop(){},getConversation(){return null},mode(){return quotaMode},canSpeak(){return true}
    },
    fallback:{async start(){quotaMode='fallback';return true}},
    environment
  });
  assert.strictEqual(await quotaOS.start({userGesture:true}),true);
  assert.strictEqual(quotaOS.snapshot().state,'fallback');
  assert.strictEqual(quotaOS.snapshot().lastRecovery.via,'fallback');

  // Permission failures must not pretend fallback can bypass microphone permission.
  const deniedOS=new voice.VoiceOS({
    primary:{async start(){const e=new Error('Permission denied');e.name='NotAllowedError';throw e},async stop(){},mode(){return'idle'},canSpeak(){return true}},
    fallback:{async start(){throw new Error('must-not-run')}},environment
  });
  assert.strictEqual(await deniedOS.start({userGesture:true}),false);
  assert.strictEqual(deniedOS.snapshot().state,'error');
  assert.strictEqual(deniedOS.snapshot().lastError.class,'microphone_permission');

  // Connection timeout follows the same recovery path and uses fallback.
  let timeoutMode='idle';
  const timeoutOS=new voice.VoiceOS({
    primary:{start:()=>new Promise(()=>{}),async stop(){},mode(){return timeoutMode},canSpeak(){return true}},
    fallback:{async start(){timeoutMode='fallback';return true}},environment,timeoutMs:500
  });
  assert.strictEqual(await timeoutOS.start({userGesture:true}),true);
  assert.strictEqual(timeoutOS.snapshot().state,'fallback');
  assert.strictEqual(timeoutOS.snapshot().lastRecovery.kind,'timeout');

  // Unexpected disconnect can recover to fallback without leaving a zombie state.
  let disconnectMode='elevenlabs';
  const disconnectOS=new voice.VoiceOS({
    primary:{async start(){disconnectMode='elevenlabs';return true},async stop(){disconnectMode='idle'},mode(){return disconnectMode},canSpeak(){return true}},
    fallback:{async start(){disconnectMode='fallback';return true}},environment
  });
  await disconnectOS.start({userGesture:true});
  assert.strictEqual(await disconnectOS.notifyDisconnect('network disconnected'),true);
  assert.strictEqual(disconnectOS.snapshot().state,'fallback');

  // iOS requires explicit gesture before starting audio/microphone.
  const iosOS=new voice.VoiceOS({
    primary:{async start(){throw new Error('should-not-start')},async stop(){},mode(){return'idle'},canSpeak(){return true}},
    fallback:null,
    environment:{...environment,userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5}
  });
  assert.strictEqual(await iosOS.start({userGesture:false}),false);
  assert.strictEqual(iosOS.snapshot().lastError.class,'user_gesture');

  // Listening health and speaking health remain separate.
  const noMicOS=new voice.VoiceOS({
    primary:{async start(){return true},async stop(){},mode(){return'idle'},canSpeak(){return true}},
    fallback:null,environment:{userAgent:'Desktop'}
  });
  assert.strictEqual(noMicOS.snapshot().listeningHealthy,false);
  assert.strictEqual(noMicOS.snapshot().speakingHealthy,true);

  os.destroy();quotaOS.destroy();deniedOS.destroy();timeoutOS.destroy();disconnectOS.destroy();iosOS.destroy();noMicOS.destroy();
  console.log('Pink Voice OS contract: OK');
})().catch(error=>{console.error(error);process.exit(1)});
