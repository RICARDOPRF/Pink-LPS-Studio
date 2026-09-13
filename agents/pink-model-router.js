// Pink Multi-Agent / Capability Router V6
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkMultiAgent=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const DEFAULTS=[
{id:'gemini-live',label:'Gemini Live',role:'realtime-primary',capabilities:['conversation','voice','realtime','reasoning'],specialties:['native-audio','barge-in'],priority:120,availability:'configured'},
{id:'nvidia-nemotron',label:'NVIDIA Nemotron',role:'reasoning-fallback',capabilities:['reasoning','agents','analysis','coding'],specialties:['nim','nemotron'],priority:100},
{id:'nvidia-rag',label:'NVIDIA RAG Blueprint',role:'knowledge',capabilities:['rag','knowledge','retrieval'],specialties:['rag-blueprint'],priority:90,availability:'blocked_external',blockedReason:'rag_backend_not_configured'},
{id:'nvidia-aiq',label:'NVIDIA AI-Q Research',role:'research',capabilities:['research','deep-research'],specialties:['aiq-research'],priority:90,availability:'blocked_external',blockedReason:'aiq_backend_not_configured'},
{id:'nvidia-cuopt',label:'NVIDIA cuOpt',role:'optimization',capabilities:['optimization','routing','scheduling'],specialties:['cuopt'],priority:85,availability:'blocked_external',blockedReason:'cuopt_runtime_not_configured'},
{id:'nvidia-cudf',label:'NVIDIA cuDF',role:'data-acceleration',capabilities:['dataframe','etl','gpu-data'],specialties:['cudf'],priority:70,availability:'blocked_external',blockedReason:'gpu_runtime_not_configured'},
{id:'nvidia-deepstream',label:'NVIDIA DeepStream',role:'vision-pipeline',capabilities:['vision','video','object-detection'],specialties:['deepstream'],priority:80,availability:'blocked_external',blockedReason:'deepstream_runtime_not_configured'}
];
class Registry{
 constructor(seed=DEFAULTS){this.items=new Map();seed.forEach(x=>this.register(x))}
 register(x={}){if(!x.id)throw new Error('provider_id_required');const old=this.items.get(x.id)||{};const v={health:'unknown',availability:'unavailable',latencyMs:null,cost:{class:'unknown'},timeoutMs:30000,lastError:null,adapter:null,...old,...clone(x)};this.items.set(v.id,v);return this.public(v)}
 attach(id,adapter,meta={}){const v=this.items.get(id);if(!v)throw new Error(`provider_unknown:${id}`);if(!adapter||typeof adapter.invoke!=='function')throw new Error('provider_adapter_invoke_required');Object.assign(v,meta,{adapter,availability:'available',health:'healthy',blockedReason:null});return this.public(v)}
 public(v){const {adapter,...x}=v;return clone(x)}
 list(){return [...this.items.values()].map(v=>this.public(v))}
 available(cap){return [...this.items.values()].filter(v=>v.availability==='available'&&v.health!=='down'&&(!cap||v.capabilities?.includes(cap))).sort((a,b)=>(b.priority||0)-(a.priority||0))}
}
class Router{
 constructor(registry){this.registry=registry}
 classify(t={}){const k=String(t.kind||t.type||'reasoning').toLowerCase();if(/rag|knowledge|document|retriev/.test(k))return'rag';if(/research/.test(k))return'research';if(/optim|schedul|routing/.test(k))return'optimization';if(/video|vision|detect/.test(k))return'vision';if(/etl|dataframe/.test(k))return'dataframe';if(/voice|conversation|realtime/.test(k))return'conversation';return'reasoning'}
 route(t={}){const capability=this.classify(t),available=this.registry.available(capability),known=[...this.registry.items.values()].filter(v=>v.capabilities?.includes(capability));return{capability,primary:available[0]?this.registry.public(available[0]):null,blocked:!available.length,blockedProviders:known.filter(v=>v.availability!=='available').map(v=>({id:v.id,reason:v.blockedReason||'not_available'}))}}
 async invoke(t={}){const route=this.route(t);if(route.blocked)return{status:'blocked_external',reason:`no_provider:${route.capability}`,route};const p=this.registry.items.get(route.primary.id);const started=Date.now();try{const result=await Promise.race([Promise.resolve(p.adapter.invoke(t)),new Promise((_,r)=>setTimeout(()=>r(new Error('provider_timeout')),p.timeoutMs))]);p.health='healthy';p.latencyMs=Date.now()-started;p.lastError=null;return{status:'completed',provider:p.id,result,latencyMs:p.latencyMs,route}}catch(e){p.health='degraded';p.lastError=String(e?.message||e);const fallback=this.registry.available(route.capability).find(x=>x.id!==p.id);if(!fallback)return{status:'blocked_external',provider:p.id,error:p.lastError,route};try{return{status:'completed',provider:fallback.id,fallbackFrom:p.id,result:await fallback.adapter.invoke(t),route}}catch(e2){return{status:'failed',provider:fallback.id,error:String(e2?.message||e2),route}}}}
}
const registry=new Registry(),router=new Router(registry);
function attachKnown(){if(typeof window==='undefined')return;if(window.PinkNVIDIA?.ask)registry.attach('nvidia-nemotron',{invoke:async t=>window.PinkNVIDIA.ask(t.messages||[{role:'user',content:String(t.prompt||t.input||'')}],t.options||{})});if(window.PinkGeminiLive?.sendText)registry.attach('gemini-live',{invoke:async t=>window.PinkGeminiLive.sendText(String(t.prompt||t.input||''))});}
attachKnown();
if(typeof window!=='undefined')window.addEventListener('pinkprovider:ready',attachKnown);
return{version:'6.0.0',registry,router,attach:(id,a,m)=>registry.attach(id,a,m),route:t=>router.route(t),invoke:t=>router.invoke(t),snapshot:()=>({version:'6.0.0',policy:'NO_EVIDENCE_NO_CLAIM',providers:registry.list()})};
});