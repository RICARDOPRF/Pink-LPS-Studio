// Pink Phase 10 — QA / Security / Observability
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkObservability=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const redact=v=>String(v??'').replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[REDACTED]').replace(/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{10,})\b/g,'[REDACTED_SECRET]').slice(0,2000);
class Observatory{
 constructor(){this.logs=[];this.metrics=new Map();this.traces=new Map();this.health=new Map();this.security=[];this.startedAt=Date.now()}
 log(level,event,data={}){const item={at:new Date().toISOString(),level,event:redact(event),data:JSON.parse(JSON.stringify(data,(k,val)=>typeof val==='string'?redact(val):val))};this.logs.push(item);this.logs=this.logs.slice(-500);return clone(item)}
 metric(name,value=1,tags={}){const key=String(name);const prev=this.metrics.get(key)||{count:0,sum:0,min:null,max:null,last:null,tags:{}};const n=Number(value);if(Number.isFinite(n)){prev.count+=1;prev.sum+=n;prev.min=prev.min==null?n:Math.min(prev.min,n);prev.max=prev.max==null?n:Math.max(prev.max,n);prev.last=n}prev.tags={...prev.tags,...clone(tags)};this.metrics.set(key,prev);return clone(prev)}
 startTrace(name,meta={}){const id=`tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;this.traces.set(id,{id,name,meta:clone(meta),startedAt:Date.now(),endedAt:null,durationMs:null,status:'running'});return id}
 endTrace(id,status='completed',data={}){const tr=this.traces.get(id);if(!tr)return null;tr.endedAt=Date.now();tr.durationMs=tr.endedAt-tr.startedAt;tr.status=status;tr.data=clone(data);this.metric(`trace.${tr.name}.duration_ms`,tr.durationMs);return clone(tr)}
 setHealth(component,status,details={}){const item={component,status,details:clone(details),checkedAt:new Date().toISOString()};this.health.set(component,item);return clone(item)}
 securityEvent(kind,severity='medium',details={}){const item={at:new Date().toISOString(),kind,severity,details:clone(details)};this.security.push(item);this.security=this.security.slice(-300);this.log(severity==='critical'?'error':'warn',`security:${kind}`,details);return clone(item)}
 synthetic(){const checks=[];const expect=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail});if(typeof window!=='undefined'){expect('foundation',window.PinkFoundation?.health?.().ok===true);expect('operating-core',Boolean(window.PinkOperatingCore));expect('voice-os',Boolean(window.PinkVoiceOS));expect('memory',Boolean(window.PinkMemoryCloud));expect('webgl-runtime',Boolean(window.PinkAvatar3D&&window.PinkPerformance));expect('multi-agent',Boolean(window.PinkMultiAgent));expect('studio',Boolean(window.PinkStudio));expect('tools',Boolean(window.PinkTools));expect('companion',Boolean(window.PinkCompanion));expect('evolution',Boolean(window.PinkAutonomousEvolution));expect('enterprise',Boolean(window.PinkEnterprise))}const ok=checks.every(c=>c.ok);this.setHealth('synthetic',ok?'healthy':'degraded',{checks});return {ok,checks}}
 dashboard(){return {version:'10.0.0',uptimeMs:Date.now()-this.startedAt,health:[...this.health.values()].map(clone),metrics:Object.fromEntries([...this.metrics.entries()].map(([k,v])=>[k,clone(v)])),recentLogs:this.logs.slice(-50),security:this.security.slice(-30),traces:[...this.traces.values()].slice(-30).map(clone)}}
}
const obs=new Observatory();
if(typeof window!=='undefined'){
 window.addEventListener('error',e=>{obs.log('error','window.error',{message:e.message,filename:e.filename,lineno:e.lineno});obs.metric('runtime.errors',1)});
 window.addEventListener('unhandledrejection',e=>{obs.log('error','window.unhandledrejection',{reason:String(e.reason?.message||e.reason||'unknown')});obs.metric('runtime.unhandled_rejections',1)});
 try{const nav=performance.getEntriesByType?.('navigation')?.[0];if(nav){obs.metric('page.dom_content_loaded_ms',nav.domContentLoadedEventEnd);obs.metric('page.load_ms',nav.loadEventEnd)}}catch(_){ }
}
return {version:'10.0.0',log:(l,e,d)=>obs.log(l,e,d),metric:(n,v,t)=>obs.metric(n,v,t),startTrace:(n,m)=>obs.startTrace(n,m),endTrace:(id,s,d)=>obs.endTrace(id,s,d),setHealth:(c,s,d)=>obs.setHealth(c,s,d),security:(k,s,d)=>obs.securityEvent(k,s,d),synthetic:()=>obs.synthetic(),dashboard:()=>obs.dashboard()};
});