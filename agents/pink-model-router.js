// Pink Phase 5 — Multi-Agent Brain
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkMultiAgent=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const now=()=>Date.now();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const DEFAULTS=[
{id:'chatgpt',label:'ChatGPT',role:'leader',capabilities:['planning','reasoning','coding','review','orchestration'],specialties:['supervision','general'],priority:100},
{id:'codex',label:'Codex',role:'specialist',capabilities:['coding','tests','diff','repo'],specialties:['implementation'],priority:90},
{id:'claude',label:'Claude',role:'reviewer',capabilities:['architecture','review','refactor'],specialties:['architecture','long-context'],priority:80},
{id:'gemini',label:'Gemini',role:'reviewer',capabilities:['review','vision','research'],specialties:['independent-review'],priority:75},
{id:'blackbox',label:'Blackbox',role:'specialist',capabilities:['coding','search'],specialties:['code-support'],priority:60},
{id:'nvidia',label:'NVIDIA',role:'specialist',capabilities:['inference','vision','gpu'],specialties:['nim','vision'],priority:70},
{id:'nano-banana',label:'Nano Banana',role:'specialist',capabilities:['visual','image'],specialties:['visual-generation'],priority:65}
];
class ProviderRegistry{
 constructor(seed=DEFAULTS){this.items=new Map();seed.forEach(x=>this.register(x))}
 register(input={}){if(!input.id)throw new Error('provider_id_required');const previous=this.items.get(input.id)||{};const value={health:'unknown',availability:'unavailable',latencyMs:null,cost:{class:'unknown'},timeoutMs:30000,maxRetries:1,cooldownMs:15000,permissions:['read'],lastError:null,adapter:null,lastUsedAt:null,...previous,...clone(input)};this.items.set(value.id,value);return clone(this.public(value))}
 attach(id,adapter,meta={}){const item=this.items.get(id);if(!item)throw new Error(`provider_unknown:${id}`);if(!adapter||typeof adapter.invoke!=='function')throw new Error('provider_adapter_invoke_required');Object.assign(item,meta,{adapter,availability:'available',health:'healthy',lastError:null});return clone(this.public(item))}
 mark(id,patch={}){const item=this.items.get(id);if(!item)return null;Object.assign(item,patch);return clone(this.public(item))}
 get(id){const item=this.items.get(id);return item?clone(this.public(item)):null}
 list(){return [...this.items.values()].map(x=>clone(this.public(x)))}
 public(x){const {adapter,...rest}=x;return rest}
 available(capability){return [...this.items.values()].filter(x=>x.availability==='available'&&x.health!=='down'&&(!capability||x.capabilities?.includes(capability))).sort((a,b)=>(b.priority||0)-(a.priority||0))}
}
class ModelRouter{
 constructor(registry){this.registry=registry}
 classify(task={}){const kind=String(task.kind||task.type||'general').toLowerCase();const critical=Boolean(task.critical||task.risk==='DESTRUCTIVE'||task.risk==='PRODUCTION');if(kind.includes('visual'))return {primary:'visual',review:false};if(kind.includes('code')||kind.includes('implement'))return {primary:'coding',review:critical};if(kind.includes('architect')||kind.includes('refactor'))return {primary:'architecture',review:true};if(kind.includes('vision')||kind.includes('gpu'))return {primary:'vision',review:false};return {primary:'reasoning',review:critical}}
 route(task={}){const rule=this.classify(task);const available=this.registry.available(rule.primary);const leader=this.registry.available('orchestration').find(x=>x.id==='chatgpt')||this.registry.get('chatgpt');const primary=available[0]||null;const reviewers=rule.review?this.registry.available('review').filter(x=>x.id!==primary?.id).slice(0,2):[];return {leader,primary,reviewers,capability:rule.primary,blocked:!primary}}
 async invoke(task={}){const route=this.route(task);if(route.blocked)return {status:'blocked_external',reason:`no_provider:${route.capability}`,route};const provider=this.registry.items.get(route.primary.id);const started=now();try{provider.lastUsedAt=started;const result=await Promise.race([Promise.resolve(provider.adapter.invoke(task)),new Promise((_,reject)=>setTimeout(()=>reject(new Error('provider_timeout')),provider.timeoutMs||30000))]);provider.health='healthy';provider.latencyMs=now()-started;provider.lastError=null;return {status:'completed',provider:route.primary.id,result,route,latencyMs:provider.latencyMs}}catch(error){provider.health='degraded';provider.lastError=String(error?.message||error);provider.latencyMs=now()-started;const fallback=this.registry.available(route.capability).find(x=>x.id!==provider.id);if(!fallback)return {status:'blocked_external',provider:provider.id,error:provider.lastError,route};const alt=this.registry.items.get(fallback.id);try{const result=await alt.adapter.invoke(task);return {status:'completed',provider:alt.id,fallbackFrom:provider.id,result,route}}catch(second){alt.health='degraded';alt.lastError=String(second?.message||second);return {status:'failed',error:alt.lastError,provider:alt.id,route}}}}
 async review(task,result){const route=this.route({...task,critical:true});const reviews=[];for(const meta of route.reviewers){const provider=this.registry.items.get(meta.id);try{reviews.push({provider:meta.id,status:'completed',result:await provider.adapter.invoke({kind:'review',task,result})})}catch(error){reviews.push({provider:meta.id,status:'failed',error:String(error?.message||error)})}}return reviews}
 resolve(reviews=[]){const ok=reviews.filter(x=>x.status==='completed');if(!ok.length)return {decision:'leader_required',confidence:0};const accepts=ok.filter(x=>x.result?.decision==='approve'||x.result?.ok===true).length;return {decision:accepts>=Math.ceil(ok.length/2)?'approve':'leader_review',confidence:ok.length?accepts/ok.length:0,reviews:ok.length}}
}
const registry=new ProviderRegistry();
const router=new ModelRouter(registry);
function attachKnownBrowserAdapters(){
 if(typeof window==='undefined')return;
 if(window.PinkNVIDIA?.ask)registry.attach('nvidia',{invoke:async task=>{const messages=task.messages||[{role:'user',content:String(task.prompt||task.input||'')}];return window.PinkNVIDIA.ask(messages,task.options||{})}},{availability:'available'});
 // ChatGPT is the supervisory identity, but no browser API credential is embedded. External orchestrators may attach an adapter at runtime.
}
attachKnownBrowserAdapters();
return {version:'5.0.0',registry,router,attach:(id,adapter,meta)=>registry.attach(id,adapter,meta),route:task=>router.route(task),invoke:task=>router.invoke(task),review:(task,result)=>router.review(task,result),resolve:reviews=>router.resolve(reviews),snapshot:()=>({version:'5.0.0',leader:'chatgpt',providers:registry.list()})};
});