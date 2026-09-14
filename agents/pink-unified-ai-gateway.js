// Pink Unified AI Gateway — one Pink, many providers/tools, evidence-first routing.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkAIGateway=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const PROVIDER_TRUTH=['not_implemented','implemented','configured','connected','healthy','degraded','unavailable','blocked_external'];
function normalizeStatus(v){const s=String(v||'unavailable');return PROVIDER_TRUTH.includes(s)?s:'unavailable'}
function emit(detail){try{root?.dispatchEvent?.(new CustomEvent('pinkai:provider-result',{detail:clone(detail)}))}catch(_){}}
class Gateway{
 constructor(){this.providers=new Map();this.tools=null;this.modelRouter=null;this.registerDefaults()}
 registerDefaults(){[
  {id:'chatgpt',label:'ChatGPT Supervisor',capabilities:['conversation','orchestration','reasoning','coding'],priority:110,status:'implemented'},
  {id:'gemini-live',label:'Gemini Live',capabilities:['voice','vision'],priority:100,status:'implemented'},
  {id:'gemini-reasoning',label:'Gemini Reasoning + Search',capabilities:['reasoning','research','search'],priority:100,status:'implemented'},
  {id:'nvidia-nemotron',label:'NVIDIA Nemotron',capabilities:['reasoning','agents','fallback'],priority:90,status:'implemented'},
  {id:'codex',label:'Codex',capabilities:['coding','tests','diff','repo'],priority:90,status:'blocked_external'},
  {id:'claude',label:'Claude',capabilities:['review','architecture','long-context'],priority:85,status:'blocked_external'},
  {id:'rag-blueprint',label:'NVIDIA RAG Blueprint',capabilities:['rag','retrieval','knowledge'],priority:80,status:'blocked_external'},
  {id:'aiq-research',label:'NVIDIA AI-Q Research',capabilities:['research','deep-research'],priority:80,status:'blocked_external'},
  {id:'cuopt',label:'NVIDIA cuOpt',capabilities:['optimization','routing','scheduling'],priority:70,status:'blocked_external'},
  {id:'cudf',label:'NVIDIA cuDF',capabilities:['dataframe','etl','analytics-gpu'],priority:60,status:'blocked_external'},
  {id:'deepstream',label:'NVIDIA DeepStream',capabilities:['vision-pipeline','video-analytics'],priority:60,status:'blocked_external'}
 ].forEach(x=>this.register(x))}
 register(meta={}){if(!meta.id)throw new Error('gateway_provider_id_required');const prev=this.providers.get(meta.id)||{};const value={adapter:null,lastError:null,lastLatencyMs:null,lastUsedAt:null,...prev,...clone(meta),status:normalizeStatus(meta.status||prev.status)};this.providers.set(value.id,value);return this.public(value)}
 attach(id,adapter,meta={}){const p=this.providers.get(id);if(!p)throw new Error(`gateway_provider_unknown:${id}`);if(!adapter||typeof adapter.invoke!=='function')throw new Error('gateway_adapter_invoke_required');Object.assign(p,clone(meta),{adapter,status:'connected',lastError:null});return this.public(p)}
 mark(id,status,patch={}){const p=this.providers.get(id);if(!p)return null;Object.assign(p,clone(patch),{status:normalizeStatus(status)});return this.public(p)}
 public(p){const {adapter,...rest}=p;return clone(rest)}
 list(){return [...this.providers.values()].map(p=>this.public(p))}
 available(cap){return [...this.providers.values()].filter(p=>p.adapter&&['connected','healthy','degraded'].includes(p.status)&&p.capabilities?.includes(cap)).sort((a,b)=>(b.priority||0)-(a.priority||0))}
 classify(task={}){const text=`${task.kind||''} ${task.intent||''} ${task.prompt||task.input||''}`.toLowerCase();if(/research|pesquis|mercado|concorrent|norma/.test(text))return 'research';if(/rag|document|arquivo|procedimento|memoria|conhecimento/.test(text))return 'rag';if(/otimiz|rota|cronograma|schedule|aloca/.test(text))return 'optimization';if(/codigo|code|implement|corrig|bug|refactor/.test(text))return 'coding';if(/review|revis|arquitet/.test(text))return 'review';if(/video|camera|visao|vision/.test(text))return 'vision-pipeline';return 'reasoning'}
 async invoke(task={}){const capability=this.classify(task);const candidates=this.available(capability);if(!candidates.length){const result={status:'blocked_external',reason:`no_connected_provider:${capability}`,capability,providers:this.list().filter(p=>p.capabilities?.includes(capability))};emit(result);return result}const attempts=[];for(const meta of candidates){const p=this.providers.get(meta.id),started=Date.now();p.lastUsedAt=new Date(started).toISOString();try{const result=await Promise.race([Promise.resolve(p.adapter.invoke(task)),new Promise((_,rej)=>setTimeout(()=>rej(new Error('provider_timeout')),p.timeoutMs||30000))]);p.status='healthy';p.lastLatencyMs=Date.now()-started;p.lastError=null;attempts.push({provider:p.id,status:'completed',latencyMs:p.lastLatencyMs});const out={status:'completed',provider:p.id,capability,result,attempts};emit(out);return out}catch(e){p.status='degraded';p.lastLatencyMs=Date.now()-started;p.lastError=String(e?.message||e);const attempt={provider:p.id,status:'failed',error:p.lastError,latencyMs:p.lastLatencyMs};attempts.push(attempt);emit({status:'failed',provider:p.id,capability,error:p.lastError,attempts:[attempt]})}}const result={status:'blocked_external',reason:`all_providers_failed:${capability}`,capability,attempts};emit({...result,status:'all_failed'});return result}
 async tool(name,capability,args={},context={}){if(!this.tools?.invoke)return {status:'blocked_external',reason:'tool_registry_unavailable'};return this.tools.invoke(name,capability,args,context)}
 snapshot(){return {version:'1.2.0',providers:this.list(),toolRegistry:Boolean(this.tools),modelRouter:Boolean(this.modelRouter)}}
}
const gateway=new Gateway();
function attachBrowser(){if(typeof window==='undefined')return;gateway.tools=window.PinkTools||null;gateway.modelRouter=window.PinkMultiAgent||null;
 if(window.PinkOpenAI?.ask)gateway.attach('chatgpt',{invoke:async task=>window.PinkOpenAI.ask(String(task.prompt||task.input||''),task.options||{})},{status:'connected',timeoutMs:60000});
 if(window.PinkNVIDIA?.ask)gateway.attach('nvidia-nemotron',{invoke:async task=>window.PinkNVIDIA.ask(task.messages||[{role:'user',content:String(task.prompt||task.input||'')}],task.options||{})},{status:'connected',timeoutMs:35000});
 if(window.PinkVoice?.provider==='gemini-live')gateway.attach('gemini-live',{invoke:async task=>({status:'voice-session',mode:window.PinkVoice.mode,prompt:task.prompt||null})},{status:window.PinkVoice.mode==='gemini-live'?'healthy':'connected',timeoutMs:10000});
}
if(typeof window!=='undefined'){const attach=()=>setTimeout(attachBrowser,0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();window.addEventListener('pinkopenai:ready',attachBrowser);window.addEventListener('pinkplatform:modules-loaded',attachBrowser)}
return {version:'1.2.0',gateway,register:m=>gateway.register(m),attach:(id,a,m)=>gateway.attach(id,a,m),mark:(id,s,p)=>gateway.mark(id,s,p),invoke:t=>gateway.invoke(t),tool:(n,c,a,ctx)=>gateway.tool(n,c,a,ctx),snapshot:()=>gateway.snapshot()};
});
