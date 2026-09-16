// Pink V14 Agent Harness — event bus, scoped approvals, plugin lifecycle and resilience.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkAgentHarness=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const RISKS=['READ_ONLY','REVERSIBLE','EXTERNAL_WRITE','DESTRUCTIVE','PRODUCTION'];
const READ_CAPABILITY=/(?:^|\.)(?:read|search|list|health|metrics|catalog|sales|open|query|snapshot|status)$/i;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const redact=v=>String(v??'').replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[REDACTED]').replace(/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{10,})\b/g,'[REDACTED_SECRET]').slice(0,2000);
function clean(value){return JSON.parse(JSON.stringify(value??{},(k,v)=>typeof v==='string'?redact(v):v))}
function effectiveRisk(meta={},capability=''){
  const explicit=meta.capabilityRisks?.[capability];
  if(RISKS.includes(explicit))return explicit;
  if(READ_CAPABILITY.test(String(capability)))return 'READ_ONLY';
  return RISKS.includes(meta.risk)?meta.risk:'READ_ONLY';
}
class EventBus{
  constructor({limit=250}={}){this.limit=Math.max(20,Number(limit)||250);this.listeners=new Map();this.events=[]}
  on(type,handler){if(typeof handler!=='function')throw new TypeError('event_handler_required');const key=String(type||'*');if(!this.listeners.has(key))this.listeners.set(key,new Set());this.listeners.get(key).add(handler);return()=>this.off(key,handler)}
  off(type,handler){const set=this.listeners.get(String(type||'*'));if(!set)return false;const removed=set.delete(handler);if(!set.size)this.listeners.delete(String(type||'*'));return removed}
  emit(type,detail={}){const event={id:`evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,type:String(type),at:new Date().toISOString(),detail:clean(detail)};this.events.push(event);if(this.events.length>this.limit)this.events=this.events.slice(-this.limit);for(const key of [event.type,'*'])for(const fn of this.listeners.get(key)||[]){try{fn(clone(event))}catch(_){}}try{root?.PinkObservability?.log?.('info',`agent:${event.type}`,event.detail)}catch(_){}return clone(event)}
  history({type=null,limit=50}={}){const list=type?this.events.filter(x=>x.type===type):this.events;return clone(list.slice(-Math.max(1,Math.min(250,Number(limit)||50))))}
}
class ApprovalBroker{
  authorize(meta={},capability='',context={}){
    const risk=effectiveRisk(meta,capability);
    const action={tool:meta.name||meta.id||'unknown',capability,risk};
    if(risk==='READ_ONLY')return {allowed:true,risk,action};
    if(risk==='DESTRUCTIVE'||risk==='PRODUCTION')return {allowed:false,status:'blocked',risk,reason:'explicit_human_override_required',action};
    const uiApproved=context?.approvedByUi===true&&context?.approvalSource==='PinkConfirmGate'&&Boolean(context?.confirmationId);
    if(!uiApproved)return {allowed:false,status:'needs_approval',risk,reason:'scoped_ui_confirmation_required',action};
    return {allowed:true,risk,action,confirmationId:String(context.confirmationId)};
  }
}
class CircuitBreaker{
  constructor({threshold=2,baseCooldownMs=15000,maxCooldownMs=120000}={}){this.threshold=Math.max(1,threshold);this.base=baseCooldownMs;this.max=maxCooldownMs;this.state=new Map()}
  canAttempt(id){const s=this.state.get(id);if(!s||!s.openUntil)return true;if(Date.now()>=s.openUntil){s.openUntil=0;return true}return false}
  success(id){this.state.set(id,{failures:0,openUntil:0,lastError:null,lastSuccessAt:new Date().toISOString()})}
  failure(id,error){const prev=this.state.get(id)||{failures:0,openUntil:0};const failures=prev.failures+1;const cooldown=failures>=this.threshold?Math.min(this.max,this.base*Math.pow(2,failures-this.threshold)):0;this.state.set(id,{...prev,failures,openUntil:cooldown?Date.now()+cooldown:0,lastError:redact(error?.message||error),lastFailureAt:new Date().toISOString()});return this.snapshot(id)}
  snapshot(id=null){if(id){const s=this.state.get(id)||{failures:0,openUntil:0,lastError:null};return {...clone(s),open:Boolean(s.openUntil&&Date.now()<s.openUntil)}}return Object.fromEntries([...this.state.entries()].map(([k,v])=>[k,{...clone(v),open:Boolean(v.openUntil&&Date.now()<v.openUntil)}]))}
}
class PluginManager{
  constructor({bus=new EventBus(),approvals=new ApprovalBroker(),circuits=new CircuitBreaker()}={}){this.bus=bus;this.approvals=approvals;this.circuits=circuits;this.plugins=new Map()}
  register(meta={}){const id=String(meta.id||meta.name||'').trim();if(!id)throw new Error('plugin_id_required');const previous=this.plugins.get(id)||{};const item={id,name:id,version:'1.0.0',description:'',capabilities:[],risk:'READ_ONLY',capabilityRisks:{},health:'configured',adapter:null,...previous,...clone(meta),id};if(!RISKS.includes(item.risk))throw new Error('plugin_risk_invalid');this.plugins.set(id,item);this.bus.emit('plugin.registered',{id,version:item.version,capabilities:item.capabilities});return this.public(item)}
  attach(id,adapter){const item=this.plugins.get(String(id));if(!item)throw new Error(`plugin_unknown:${id}`);if(!adapter||typeof adapter.invoke!=='function')throw new Error('plugin_adapter_invoke_required');item.adapter=adapter;item.health='healthy';this.bus.emit('plugin.attached',{id:item.id});return this.public(item)}
  public(item){const {adapter,...rest}=item;return clone(rest)}
  list(){return [...this.plugins.values()].map(x=>this.public(x))}
  async invoke(id,capability,args={},context={}){const item=this.plugins.get(String(id));if(!item)return {status:'blocked_external',reason:`plugin_unknown:${id}`};if(!item.capabilities.includes(capability))return {status:'failed',reason:`capability_not_declared:${capability}`};const auth=this.approvals.authorize(item,capability,context);if(!auth.allowed){this.bus.emit('plugin.blocked',{id:item.id,capability,...auth});return {status:auth.status||'needs_approval',plugin:item.id,capability,risk:auth.risk,reason:auth.reason}};if(!item.adapter)return {status:'blocked_external',reason:`plugin_adapter_unavailable:${item.id}`};if(!this.circuits.canAttempt(item.id))return {status:'blocked_external',reason:`plugin_circuit_open:${item.id}`,circuit:this.circuits.snapshot(item.id)};const started=Date.now();this.bus.emit('plugin.invoke.started',{id:item.id,capability,risk:auth.risk});try{const result=await Promise.race([Promise.resolve(item.adapter.invoke(capability,args,{...context,approved:auth.allowed,risk:auth.risk})),new Promise((_,reject)=>setTimeout(()=>reject(new Error('plugin_timeout')),Number(item.timeoutMs)||15000))]);this.circuits.success(item.id);item.health='healthy';this.bus.emit('plugin.invoke.completed',{id:item.id,capability,latencyMs:Date.now()-started});return {status:'completed',plugin:item.id,capability,result,risk:auth.risk}}catch(error){item.health='degraded';const circuit=this.circuits.failure(item.id,error);this.bus.emit('plugin.invoke.failed',{id:item.id,capability,error:redact(error?.message||error),circuit});return {status:'failed',plugin:item.id,capability,error:redact(error?.message||error),circuit}}
  }
}
const bus=new EventBus();const approvals=new ApprovalBroker();const circuits=new CircuitBreaker();const plugins=new PluginManager({bus,approvals,circuits});
function bridgeTools(){
  const tools=root?.PinkTools?.snapshot?.().tools||root?.PinkTools?.registry?.list?.()||[];
  for(const meta of tools){
    if(!plugins.plugins.has(meta.name))plugins.register({id:meta.name,name:meta.name,capabilities:meta.capabilities||[],risk:meta.risk||'READ_ONLY',capabilityRisks:meta.capabilityRisks||{},timeoutMs:meta.timeoutMs||15000,description:`Pink Tool: ${meta.name}`});
    try{plugins.attach(meta.name,{invoke:(capability,args,context)=>root.PinkTools.invoke(meta.name,capability,args,context)})}catch(_){}
  }
  return plugins.list();
}
async function invokeTool(name,capability,args={},context={}){bridgeTools();return plugins.invoke(name,capability,args,context)}
function snapshot(){return {version:'14.0.0',events:bus.history({limit:30}),plugins:plugins.list(),circuits:circuits.snapshot(),toolBridge:Boolean(root?.PinkTools)}}
if(typeof window!=='undefined'){
  const install=()=>{try{bridgeTools();root.PinkObservability?.setHealth?.('agent-harness','healthy',{version:'14.0.0',plugins:plugins.list().length})}catch(error){root.PinkObservability?.setHealth?.('agent-harness','degraded',{error:redact(error?.message||error)})}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else queueMicrotask(install);
  window.addEventListener('pinkplatform:modules-loaded',install);window.addEventListener('pinkplatform:ready',install);
}
return {version:'14.0.0',RISKS,effectiveRisk,EventBus,ApprovalBroker,CircuitBreaker,PluginManager,bus,approvals,circuits,plugins,bridgeTools,invokeTool,snapshot};
});
