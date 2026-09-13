// Pink Phase 2 — Voice OS supervisor.
// Wraps the existing ElevenLabs + browser/NVIDIA voice runtime without replacing Roberta or its fallback path.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    root.PinkVoiceOSFactory = api;
    const boot = () => {
      if (root.PinkVoiceOS || !root.PinkVoice) return root.PinkVoiceOS || null;
      const os = api.createBrowserVoiceOS(root);
      root.PinkVoiceOS = os;
      root.PinkOperatingCore?.health?.recordExternal?.('voice-os', os.snapshot());
      root.dispatchEvent(new CustomEvent('pinkvoiceos:ready', { detail: os.snapshot() }));
      return os;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else queueMicrotask(boot);
    root.addEventListener('load', boot, { once:true });
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STATES = Object.freeze(['idle','connecting','listening','thinking','speaking','recovering','fallback','error']);
  const ALLOWED = Object.freeze({
    idle:new Set(['connecting','fallback','error']),
    connecting:new Set(['listening','recovering','fallback','error','idle']),
    listening:new Set(['thinking','speaking','recovering','fallback','error','idle']),
    thinking:new Set(['speaking','listening','recovering','fallback','error','idle']),
    speaking:new Set(['listening','thinking','recovering','fallback','error','idle']),
    recovering:new Set(['connecting','listening','fallback','error','idle']),
    fallback:new Set(['listening','thinking','speaking','recovering','error','idle','connecting']),
    error:new Set(['recovering','connecting','fallback','idle'])
  });
  const clamp = (value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
  const text = (value,max=400)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function classifyError(error) {
    const name = text(error?.name,100).toLowerCase();
    const raw = `${text(error?.message||error,700)} ${text(error?.code,120)}`.toLowerCase();
    if (name.includes('notallowed') || name.includes('security') || raw.includes('permission') || raw.includes('not allowed')) return 'microphone_permission';
    if (raw.includes('getusermedia') || raw.includes('microphone_api_unavailable') || raw.includes('speechrecognition_unavailable')) return 'unsupported';
    if (raw.includes('quota') || raw.includes('credit') || raw.includes('429') || raw.includes('exceeds your quota') || raw.includes('limit exceeded')) return 'quota';
    if (raw.includes('401') || raw.includes('403') || raw.includes('authentication') || raw.includes('authorization') || raw.includes('private agent')) return 'auth';
    if (raw.includes('timeout') || raw.includes('timed out')) return 'timeout';
    if (raw.includes('network') || raw.includes('webrtc') || raw.includes('websocket') || raw.includes('offline') || raw.includes('disconnect')) return 'network';
    return 'provider';
  }

  class VoiceStateMachine {
    constructor({now=()=>Date.now()}={}) { this.now=now; this.state='idle'; this.history=[]; }
    set(next, reason='runtime') {
      const normalized=String(next||'');
      if(!STATES.includes(normalized)) throw new Error(`unknown_voice_state:${normalized}`);
      if(normalized===this.state) return this.snapshot();
      if(!ALLOWED[this.state]?.has(normalized)) throw new Error(`invalid_voice_transition:${this.state}->${normalized}`);
      this.history.push({from:this.state,to:normalized,reason:text(reason,160),at:this.now()});
      this.history=this.history.slice(-80);this.state=normalized;return this.snapshot();
    }
    force(next,reason='external-sync') {
      if(!STATES.includes(next)) throw new Error(`unknown_voice_state:${next}`);
      if(next!==this.state){this.history.push({from:this.state,to:next,reason:text(reason,160),at:this.now(),forced:true});this.history=this.history.slice(-80);this.state=next}
      return this.snapshot();
    }
    snapshot(){return {state:this.state,history:clone(this.history)}}
  }

  class EchoGuard {
    constructor(){this.speaking=false;this.mode='idle';this.lastActivityAt=0}
    update({state,providerMode}){
      this.speaking=state==='speaking';
      this.mode=this.speaking?(providerMode==='fallback'?'fallback-listen-paused':'provider-echo-managed'):'idle';
      return this.snapshot();
    }
    activity(){this.lastActivityAt=Date.now();return this.snapshot()}
    snapshot(){return {speaking:this.speaking,mode:this.mode,lastActivityAt:this.lastActivityAt}}
  }

  class VoiceWatchdog {
    constructor({timeoutMs=9000,maxRecoveries=2,now=()=>Date.now()}={}){this.timeoutMs=Math.max(500,timeoutMs);this.maxRecoveries=Math.max(0,Math.min(5,maxRecoveries));this.now=now;this.recoveries=0;this.lastHealthyAt=now();this.lastError=null}
    healthy(){this.lastHealthyAt=this.now();this.recoveries=0;this.lastError=null}
    canRecover(){return this.recoveries<this.maxRecoveries}
    record(error){this.lastError=classifyError(error);this.recoveries+=1;return this.snapshot()}
    snapshot(){return {timeoutMs:this.timeoutMs,maxRecoveries:this.maxRecoveries,recoveries:this.recoveries,lastHealthyAt:this.lastHealthyAt,lastError:this.lastError}}
  }

  class VoiceOS {
    constructor({primary,fallback=null,environment={},now=()=>Date.now(),timeoutMs=9000,maxRecoveries=2}={}){
      if(!primary || typeof primary.start!=='function' || typeof primary.stop!=='function') throw new Error('voice_primary_adapter_required');
      this.primary=primary;this.fallback=fallback;this.environment=environment;this.now=now;
      this.machine=new VoiceStateMachine({now});this.watchdog=new VoiceWatchdog({timeoutMs,maxRecoveries,now});this.echo=new EchoGuard();
      this.provider='elevenlabs';this.providerMode='idle';this.listenMuted=false;this.speakMuted=false;this.lastError=null;this.lastRecovery=null;this.destroyed=false;
      this.events=[];this.listeners=new Set();this.pollTimer=0;this.stageObserver=null;
    }
    emit(type,detail={}){
      const event={at:this.now(),type:text(type,80),...clone(detail)};this.events.push(event);this.events=this.events.slice(-100);
      for(const listener of this.listeners){try{listener(event,this.snapshot())}catch(_){}}
      return event;
    }
    subscribe(listener){if(typeof listener!=='function')return()=>{};this.listeners.add(listener);return()=>this.listeners.delete(listener)}
    capabilities(){
      const micApi=Boolean(this.environment.mediaDevices?.getUserMedia);
      const recognition=Boolean(this.environment.SpeechRecognition || this.environment.webkitSpeechRecognition);
      const speech=Boolean(this.environment.speechSynthesis || this.primary.canSpeak?.());
      return {
        canListen:micApi||recognition,
        canSpeak:speech||Boolean(this.primary.canSpeak?.()),
        primaryAvailable:true,
        fallbackListenAvailable:recognition,
        fallbackSpeakAvailable:Boolean(this.environment.speechSynthesis),
        micMuteSupported:Boolean(this.conversation()?.setMicMuted),
        userActivitySupported:Boolean(this.conversation()?.sendUserActivity),
        interruptionMethod:Boolean(this.conversation()?.interrupt) ? 'interrupt' : Boolean(this.conversation()?.sendUserActivity) ? 'user-activity' : 'provider-managed'
      };
    }
    conversation(){try{return this.primary.getConversation?.()||null}catch(_){return null}}
    providerModeNow(){try{return String(this.primary.mode?.()??this.primary.mode??this.providerMode||'idle')}catch(_){return this.providerMode||'idle'}}
    isIOS(){const ua=String(this.environment.userAgent||'');return /iPad|iPhone|iPod/.test(ua)||(this.environment.platform==='MacIntel'&&Number(this.environment.maxTouchPoints)>1)}
    async timed(operation,timeoutMs=this.watchdog.timeoutMs){
      let timer;
      try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('voice_connection_timeout');e.code='timeout';reject(e)},timeoutMs)})])}
      finally{clearTimeout(timer)}
    }
    syncProviderMode(reason='sync'){
      const mode=this.providerModeNow();this.providerMode=mode;
      if(mode==='fallback' && this.machine.state!=='speaking' && this.machine.state!=='thinking') this.machine.force('fallback',reason);
      else if(mode==='elevenlabs' && ['connecting','recovering','idle','fallback'].includes(this.machine.state)) this.machine.force('listening',reason);
      else if(mode==='idle' && !['connecting','recovering','error'].includes(this.machine.state)) this.machine.force('idle',reason);
      this.echo.update({state:this.machine.state,providerMode:mode});return mode;
    }
    syncStageState(stageState){
      const state=String(stageState||'').toLowerCase();
      if(['listening','thinking','speaking'].includes(state)) this.machine.force(state,'stage-sync');
      else if(state==='error') this.machine.force('error','stage-sync');
      else if(state==='idle' && this.providerModeNow()==='idle') this.machine.force('idle','stage-sync');
      this.echo.update({state:this.machine.state,providerMode:this.providerModeNow()});this.emit('state-sync',{stageState:state});return this.snapshot();
    }
    async start({userGesture=false}={}){
      if(this.destroyed) throw new Error('voice_os_destroyed');
      if(this.isIOS()&&!userGesture){const e=new Error('ios_user_gesture_required');e.code='user_gesture';this.lastError={class:'user_gesture',message:e.message};this.machine.force('error','ios-gesture');this.emit('start-blocked',this.lastError);return false}
      if(!this.capabilities().canListen){const e=new Error('microphone_api_unavailable');this.lastError={class:'unsupported',message:e.message};this.machine.force('error','unsupported');this.emit('start-blocked',this.lastError);return false}
      this.machine.force('connecting','start');this.emit('connecting');
      try{
        const ok=await this.timed(()=>this.primary.start({userGesture}));
        if(ok===false) throw new Error('voice_primary_start_failed');
        this.syncProviderMode('start-complete');this.watchdog.healthy();this.lastError=null;this.emit('started',{mode:this.providerMode});return true;
      }catch(error){return this.recover(error,{source:'start',userGesture})}
    }
    async stop(){
      try{await this.primary.stop()}finally{this.providerMode='idle';this.machine.force('idle','stop');this.listenMuted=false;this.speakMuted=false;this.echo.update({state:'idle',providerMode:'idle'});this.emit('stopped')}
      return true;
    }
    async recover(error,{source='runtime',userGesture=false}={}){
      const kind=classifyError(error);this.lastError={class:kind,message:text(error?.message||error,500),at:this.now()};this.watchdog.record(error);this.machine.force('recovering',kind);this.emit('recovering',{kind,source});
      if(kind==='microphone_permission'||kind==='unsupported'){this.machine.force('error',kind);this.emit('recovery-blocked',{kind});return false}
      if(this.fallback?.start){
        try{
          const ok=await this.timed(()=>this.fallback.start({userGesture,reason:kind}),Math.min(this.watchdog.timeoutMs,7000));
          if(ok!==false){this.providerMode='fallback';this.machine.force('fallback',`fallback:${kind}`);this.lastRecovery={kind,via:'fallback',at:this.now()};this.watchdog.healthy();this.emit('fallback-active',{kind});return true}
        }catch(fallbackError){this.lastError={class:classifyError(fallbackError),message:text(fallbackError?.message||fallbackError,500),at:this.now()};this.emit('fallback-failed',this.lastError)}
      }
      if(this.watchdog.canRecover() && kind!=='quota' && kind!=='auth'){
        try{
          this.machine.force('connecting','retry');
          const ok=await this.timed(()=>this.primary.start({userGesture}));
          if(ok!==false){this.syncProviderMode('retry-success');this.lastRecovery={kind,via:'primary-retry',at:this.now()};this.watchdog.healthy();this.emit('recovered',{via:'primary-retry'});return true}
        }catch(retryError){this.watchdog.record(retryError);this.lastError={class:classifyError(retryError),message:text(retryError?.message||retryError,500),at:this.now()}}
      }
      this.machine.force('error','recovery-exhausted');this.emit('recovery-failed',{kind:this.lastError?.class||kind});return false;
    }
    async notifyDisconnect(reason='disconnect'){
      if(this.machine.state==='idle') return false;
      const error=new Error(reason);error.code='network';return this.recover(error,{source:'disconnect'});
    }
    setMicMuted(muted){
      this.listenMuted=Boolean(muted);const conversation=this.conversation();
      if(conversation?.setMicMuted){conversation.setMicMuted(this.listenMuted);this.emit('mic-muted',{muted:this.listenMuted,via:'provider'});return true}
      this.emit('mic-muted',{muted:this.listenMuted,via:'logical-only'});return false;
    }
    setSpeakingMuted(muted){
      this.speakMuted=Boolean(muted);const conversation=this.conversation();
      if(conversation?.setVolume){conversation.setVolume({volume:this.speakMuted?0:1});this.emit('speaker-muted',{muted:this.speakMuted,via:'provider'});return true}
      if(this.environment.speechSynthesis && this.speakMuted) this.environment.speechSynthesis.cancel?.();
      this.emit('speaker-muted',{muted:this.speakMuted,via:'logical-or-fallback'});return false;
    }
    userActivity(){
      this.echo.activity();const conversation=this.conversation();
      if(conversation?.sendUserActivity){conversation.sendUserActivity();this.emit('user-activity',{via:'provider'});return true}
      this.emit('user-activity',{via:'local'});return false;
    }
    async bargeIn(){
      const conversation=this.conversation();
      if(conversation?.interrupt){await conversation.interrupt();this.emit('barge-in',{via:'interrupt'});return 'interrupt'}
      if(conversation?.sendUserActivity){conversation.sendUserActivity();this.emit('barge-in',{via:'user-activity'});return 'user-activity'}
      this.emit('barge-in',{via:'provider-managed'});return 'provider-managed'
    }
    startMonitor({stage=null,intervalMs=1500}={}){
      this.stopMonitor();
      if(stage && typeof MutationObserver!=='undefined'){
        this.stageObserver=new MutationObserver(()=>this.syncStageState(stage.dataset.state));
        this.stageObserver.observe(stage,{attributes:true,attributeFilter:['data-state']});
        this.syncStageState(stage.dataset.state);
      }
      this.pollTimer=setInterval(()=>{
        if(this.destroyed)return;
        const mode=this.providerModeNow();
        if(mode==='idle' && !['idle','connecting','recovering','error'].includes(this.machine.state)) this.notifyDisconnect('provider-disconnected').catch(()=>{});
        else this.syncProviderMode('watchdog-poll');
      },Math.max(500,intervalMs));
      return this.snapshot();
    }
    stopMonitor(){clearInterval(this.pollTimer);this.pollTimer=0;this.stageObserver?.disconnect?.();this.stageObserver=null}
    snapshot(){return {
      version:'2.0.0',state:this.machine.state,provider:this.provider,mode:this.providerModeNow(),listenMuted:this.listenMuted,speakMuted:this.speakMuted,
      listeningHealthy:this.capabilities().canListen && this.lastError?.class!=='microphone_permission',
      speakingHealthy:this.capabilities().canSpeak,
      capabilities:this.capabilities(),watchdog:this.watchdog.snapshot(),echoGuard:this.echo.snapshot(),lastError:clone(this.lastError),lastRecovery:clone(this.lastRecovery),events:clone(this.events.slice(-20))
    }}
    destroy(){this.destroyed=true;this.stopMonitor();this.listeners.clear();this.emit('destroyed')}
  }

  function createBrowserVoiceOS(win){
    const pinkVoice=win.PinkVoice;
    const primary={
      start:({userGesture=true}={})=>pinkVoice.start?.({userGesture}),
      stop:()=>pinkVoice.stop?.(),
      getConversation:()=>pinkVoice.getConversation?.(),
      mode:()=>pinkVoice.mode,
      canSpeak:()=>true
    };
    const fallback={start:()=>pinkVoice.startFallback?.()};
    const os=new VoiceOS({
      primary,fallback,
      environment:{
        mediaDevices:win.navigator?.mediaDevices,
        SpeechRecognition:win.SpeechRecognition,webkitSpeechRecognition:win.webkitSpeechRecognition,
        speechSynthesis:win.speechSynthesis,userAgent:win.navigator?.userAgent,platform:win.navigator?.platform,maxTouchPoints:win.navigator?.maxTouchPoints
      }
    });
    os.startMonitor({stage:win.document.querySelector('#pinkStage')});
    win.PinkOperatingCore?.health?.recordExternal?.('voice-os',os.snapshot());
    return os;
  }

  return Object.freeze({version:'2.0.0',STATES,classifyError,VoiceStateMachine,EchoGuard,VoiceWatchdog,VoiceOS,createBrowserVoiceOS});
});
