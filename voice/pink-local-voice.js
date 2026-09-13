// Pink local voice client: zero-metered voice path through loopback Companion.
(function(root){
'use strict';
const BASE='http://127.0.0.1:8765';
const state={available:false,health:null,lastError:null,checkedAt:0};
async function health(){
  try{const r=await fetch(BASE+'/health',{cache:'no-store',signal:AbortSignal.timeout(1800)});if(!r.ok)throw new Error('local_voice_http_'+r.status);state.health=await r.json();state.available=Boolean(state.health?.ok);state.lastError=null}
  catch(e){state.available=false;state.lastError=String(e?.message||e)}state.checkedAt=Date.now();return snapshot();
}
function token(){try{return sessionStorage.getItem('pink_local_voice_token')||''}catch(_){return ''}}
function setToken(value){try{sessionStorage.setItem('pink_local_voice_token',String(value||''))}catch(_){}return Boolean(value)}
async function call(path,payload,timeout=120000){const t=token();if(!t)throw new Error('pink_local_voice_token_required');const r=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json','X-Pink-Token':t},body:JSON.stringify(payload||{}),signal:AbortSignal.timeout(timeout)});const data=await r.json().catch(()=>({}));if(!r.ok||data.ok===false)throw new Error(data.error||('local_voice_http_'+r.status));return data}
const speak=text=>call('/v1/tts/speak',{text});
const transcribe=(pcm16_base64,sample_rate=16000,language='pt')=>call('/v1/stt/transcribe',{pcm16_base64,sample_rate,language});
const chat=messages=>call('/v1/llm/chat',{messages});
function snapshot(){return {version:'1.0.0',base:BASE,available:state.available,health:state.health,lastError:state.lastError,checkedAt:state.checkedAt,tokenConfigured:Boolean(token()),variableVoiceCost:'0-per-minute'}}
root.PinkLocalVoice={version:'1.0.0',health,speak,transcribe,chat,setToken,snapshot};
setTimeout(()=>health().catch(()=>{}),250);
})(window);
