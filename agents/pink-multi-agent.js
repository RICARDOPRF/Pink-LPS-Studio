// Pink Phase 5 — Multi-Agent Brain.
// ChatGPT is the policy leader/supervisor. Providers execute only through explicitly registered adapters.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')root.PinkMultiAgentCore=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=(v,max=1200)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
  const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number(v)||0));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const COST={free:0,low:1,medium:2,high:3,unknown:1.5};

  const PROVIDER_CATALOG=Object.freeze({
    chatgpt:Object.freeze({id:'chatgpt',label:'ChatGPT',role:'leader',capabilities:['supervision','planning','general','coding','architecture','review'],specialties:['orchestration','decision','planning'],costTier:'medium',expectedLatencyMs:2400,timeoutMs:15000,maxRetries:1,fallbackOrder:['nvidia','claude','gemini']}),
    gemini:Object.freeze({id:'gemini',label:'Gemini',role:'reviewer',capabilities:['general','review','vision','architecture'],specialties:['independent-review','multimodal-review'],costTier:'medium',expectedLatencyMs:2600,timeoutMs:15000,maxRetries:1,fallbackOrder:['claude','chatgpt']}),
    claude:Object.freeze({id:'claude',label:'Claude',role:'specialist',capabilities:['general','architecture','refactor','review','coding'],specialties:['architecture','refactor','long-context'],costTier:'medium',expectedLatencyMs:2800,timeoutMs:18000,maxRetries:1,fallbackOrder:['chatgpt','codex']}),
    codex:Object.freeze({id:'codex',label:'Codex',role:'developer',capabilities:['coding','tests','repo','review'],specialties:['implementation','tests','patches'],costTier:'medium',expectedLatencyMs:3000,timeoutMs:20000,maxRetries:1,fallbackOrder:['chatgpt','claude','blackbox']}),
    blackbox:Object.freeze({id:'blackbox',label:'Blackbox',role:'coding-support',capabilities:['coding','coding_support'],specialties:['code-support','alternatives'],costTier:'unknown',expectedLatencyMs:3200,timeoutMs:18000,maxRetries:1,fallbackOrder:['codex','chatgpt']}),
    nvidia:Object.freeze({id:'nvidia',label:'NVIDIA NIM',role:'inference',capabilities:['general','reasoning','coding_support','gpu'],specialties:['fast-inference','fallback-brain'],costTier:'low',expectedLatencyMs:2200,timeoutMs:14000,maxRetries:1,fallbackOrder:['chatgpt']}),
    'nano-banana':Object.freeze({id:'nano-banana',label:'Nano Banana',role:'visual',capabilities:['visual','image'],specialties:['visual-generation','visual-iteration'],costTier:'medium',expectedLatencyMs:7000,timeoutMs:30000,maxRetries:0,fallbackOrder:['gemini']})
  });

  const ROUTING_PROFILES=Object.freeze({
    general:{required:['general'],preferred:['chatgpt','nvidia','gemini','claude'],collaborators:[],reviewers:[]},
    coding:{required:['coding'],preferred:['codex','chatgpt','claude','blackbox'],collaborators:['chatgpt'],reviewers:['gemini','claude']},
    coding_support:{required:['coding_support'],preferred:['nvidia','blackbox'],collaborators:[],reviewers:[]},
    architecture:{required:['architecture'],preferred:['chatgpt','claude','gemini'],collaborators:['claude','codex'],reviewers:['gemini']},
    visual:{required:['visual'],preferred:['nano-banana'],collaborators:['codex'],reviewers:['gemini']},
    vision:{required:['vision'],preferred:['gemini'],collaborators:[],reviewers:['chatgpt']},
    gpu:{required:['gpu'],preferred:['nvidia'],collaborators:[],reviewers:['chatgpt']},
    review:{required:['review'],preferred:['gemini','claude','chatgpt','codex'],collaborators:[],reviewers:[]}
  });

  class ProviderRegistry{
    constructor({now=()=>Date.now()}={}){this.now=now;this.providers=new Map();Object.values(PROVIDER_CATALOG).forEach(d=>this.define(d))}
    define(definition={}){
      const id=text(definition.id,80);if(!id)throw new Error('provider_id_required');
      const old=this.providers.get(id);const health=old?.health||{status:'unavailable',successes:0,failures:0,consecutiveFailures:0,latencyMs:null,lastError:null,lastSuccessAt:null,lastFailureAt:null,cooldownUntil:0};
      this.providers.set(id,{...clone(definition),id,adapter:old?.adapter||null,enabled:definition.enabled!==false,health});return this.describe(id)
    }
    registerAdapter(id,adapter,{enabled=true}={}){const p=this.get(id);if(!p)throw new Error(`unknown_provider:${id}`);if(!adapter||typeof adapter.execute!=='function')throw new Error(`provider_adapter_execute_required:${id}`);p.adapter=adapter;p.enabled=enabled!==false;p.health.status=p.enabled?'online':'disabled';p.health.lastError=null;p.health.cooldownUntil=0;return this.describe(id)}
    unregisterAdapter(id){const p=this.get(id);if(!p)return false;p.adapter=null;p.health.status='unavailable';return true}
    setEnabled(id,value){const p=this.get(id);if(!p)throw new Error(`unknown_provider:${id}`);p.enabled=Boolean(value);p.health.status=p.enabled&&p.adapter?'online':p.enabled?'unavailable':'disabled';return this.describe(id)}
    get(id){return this.providers.get(String(id))||null}
    isAvailable(id){const p=this.get(id);return Boolean(p&&p.enabled&&p.adapter&&this.now()>=Number(p.health.cooldownUntil||0))}
    markSuccess(id,latencyMs){const p=this.get(id);if(!p)return;const ms=Math.max(0,Number(latencyMs)||0);p.health.successes+=1;p.health.consecutiveFailures=0;p.health.status='online';p.health.lastError=null;p.health.lastSuccessAt=this.now();p.health.latencyMs=p.health.latencyMs==null?ms:Math.round(p.health.latencyMs*.7+ms*.3);p.health.cooldownUntil=0}
    markFailure(id,error,{cooldownMs=0}={}){const p=this.get(id);if(!p)return;p.health.failures+=1;p.health.consecutiveFailures+=1;p.health.lastError=text(error?.message||error,500);p.health.lastFailureAt=this.now();const delay=p.health.consecutiveFailures>=2?Math.max(cooldownMs,30000):cooldownMs;p.health.cooldownUntil=delay?this.now()+delay:0;p.health.status=delay?'cooldown':'degraded'}
    describe(id){const p=this.get(id);if(!p)return null;const {adapter,...safe}=p;return clone({...safe,available:this.isAvailable(id),hasAdapter:Boolean(adapter)})}
    list(){return [...this.providers.keys()].map(id=>this.describe(id))}
    snapshot(){return {leader:'chatgpt',providers:this.list()}}
  }

  function createTask(input={}){
    const objective=text(input.objective||input.goal,1200);if(!objective)throw new Error('agent_task_objective_required');
    const kind=String(input.kind||'general').toLowerCase();const profile=ROUTING_PROFILES[kind]||ROUTING_PROFILES.general;const criticality=String(input.criticality||'normal').toLowerCase();
    return Object.freeze({id:String(input.id||`agent-task-${Date.now()}-${Math.random().toString(36).slice(2,8)}`),objective,kind,criticality,capabilities:[...new Set([...(profile.required||[]),...(input.capabilities||[])])],context:clone(input.context||{}),input:clone(input.input||{}),reviewRequired:Boolean(input.reviewRequired||criticality==='critical'||criticality==='high'),maxCostTier:String(input.maxCostTier||'high'),targetLatencyMs:Math.max(250,Number(input.targetLatencyMs)||15000),validator:typeof input.validator==='function'?input.validator:null,metadata:clone(input.metadata||{})})
  }

  class ModelRouter{
    constructor({registry}){this.registry=registry}
    profile(task){return ROUTING_PROFILES[task.kind]||ROUTING_PROFILES.general}
    eligible(provider,task){if(!provider?.available)return false;const caps=new Set(provider.capabilities||[]);return (task.capabilities||[]).every(cap=>caps.has(cap))}
    score(provider,task,profile){if(!this.eligible(provider,task))return -Infinity;const index=(profile.preferred||[]).indexOf(provider.id);const preference=index<0?10:50-index*6;const health=provider.health||{};const reliability=(Number(health.successes)||0)*.5-(Number(health.consecutiveFailures)||0)*8;const latency=Number(health.latencyMs??provider.expectedLatencyMs??5000);const maxCost=COST[task.maxCostTier]??3;const cost=COST[provider.costTier]??COST.unknown;if(cost>maxCost)return -Infinity;return preference+reliability-Math.min(20,latency/1000)-cost*2}
    route(rawTask){
      const task=rawTask?.objective?rawTask:createTask(rawTask);const profile=this.profile(task);const providers=this.registry.list();
      const ranked=providers.map(provider=>({provider,score:this.score(provider,task,profile)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score);const primary=ranked[0]?.provider?.id||null;
      const fallbacks=[];const p=this.registry.get(primary);for(const id of [...(p?.fallbackOrder||[]),...(profile.preferred||[]),...ranked.map(x=>x.provider.id)])if(id&&id!==primary&&!fallbacks.includes(id)&&this.registry.isAvailable(id))fallbacks.push(id);
      const available=id=>id!==primary&&this.registry.isAvailable(id);const collaborators=(profile.collaborators||[]).filter(available);const reviewers=(profile.reviewers||[]).filter(available);const critical=task.criticality==='critical'?['claude','codex','gemini'].filter(available):[];
      return {taskId:task.id,leader:'chatgpt',primary,fallbacks,collaborators:[...new Set([...collaborators,...critical])],reviewers:[...new Set(reviewers)],blockedExternal:!primary,reason:primary?'capability-health-cost-latency-match':'no_available_provider_with_required_capabilities',unavailable:providers.filter(x=>!x.available).map(x=>x.id),ranked:ranked.map(x=>({id:x.provider.id,score:Number(x.score.toFixed(2))}))}
    }
  }

  function normalizeResult(providerId,task,raw,startedAt,status='completed'){
    const output=typeof raw==='string'?raw:(raw?.output??raw?.reply??raw?.content??'');const confidence=raw?.confidence??(status==='completed'?0.7:0);
    return {taskId:task.id,providerId,status,output:String(output??''),confidence:clamp(confidence),latencyMs:Math.max(0,Date.now()-startedAt),model:raw?.model||null,usage:clone(raw?.usage||null),metadata:clone(raw?.metadata||{}),error:raw?.error?text(raw.error,500):null}
  }

  class AgentReviewer{
    validate(task,result){if(!result||result.status!=='completed')return {valid:false,reason:`status:${result?.status||'missing'}`};if(!String(result.output||'').trim())return {valid:false,reason:'empty_output'};if(task.validator){try{const v=task.validator(result.output,result);if(v===false)return {valid:false,reason:'task_validator_failed'};if(v&&typeof v==='object'&&v.valid===false)return v}catch(error){return {valid:false,reason:`validator_error:${text(error.message,120)}`}}}return {valid:true,reason:'contract_pass'}}
    async independentReview({task,result,providerId,registry,timeout}){const p=registry.get(providerId);if(!p?.adapter)return {providerId,status:'unavailable',approved:null};try{const raw=p.adapter.review?await timeout(()=>p.adapter.review(task,result),p.timeoutMs||12000):await timeout(()=>p.adapter.execute(createTask({kind:'review',objective:`Revise criticamente a resposta candidata para: ${task.objective}`,input:{candidate:result.output},context:task.context})),p.timeoutMs||12000);const approved=typeof raw?.approved==='boolean'?raw.approved:!/\b(reject|rejeit|invalid|incorret)\b/i.test(String(raw?.output||raw?.reply||raw||''));return {providerId,status:'completed',approved,detail:text(raw?.reason||raw?.output||raw?.reply||raw,500)}}catch(error){return {providerId,status:'failed',approved:null,error:text(error?.message||error,500)}}}
  }

  class ConflictResolver{
    resolve(results=[],reviews=[],leaderDecision=null){const completed=results.filter(r=>r.status==='completed'&&String(r.output||'').trim());if(!completed.length)return {status:'failed',winner:null,reason:'no_valid_result'};if(typeof leaderDecision==='function'){try{const chosen=leaderDecision(clone(completed),clone(reviews));const winner=completed.find(r=>r.providerId===chosen||r===chosen);if(winner)return {status:'completed',winner,reason:'leader-decision'}}catch(_){}}const score=result=>{const rel=reviews.filter(r=>r.candidateProviderId===result.providerId||r.candidateProviderId==null);return result.confidence+rel.filter(r=>r.approved===true).length*.15-rel.filter(r=>r.approved===false).length*.3};const winner=[...completed].sort((a,b)=>score(b)-score(a))[0];return {status:'completed',winner,reason:'confidence-review-score'}}
  }

  class MultiAgentCoordinator{
    constructor({registry=new ProviderRegistry(),router=null,reviewer=new AgentReviewer(),resolver=new ConflictResolver(),now=()=>Date.now()}={}){this.registry=registry;this.router=router||new ModelRouter({registry});this.reviewer=reviewer;this.resolver=resolver;this.now=now;this.runs=[]}
    async timeout(fn,ms){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('provider_timeout');error.code='timeout';reject(error)},Math.max(50,ms))})])}finally{clearTimeout(timer)}}
    async invoke(providerId,task){const p=this.registry.get(providerId);const started=this.now();if(!p||!this.registry.isAvailable(providerId))return normalizeResult(providerId,task,{error:'provider_unavailable'},started,'unavailable');let last=null;for(let attempt=0;attempt<=Math.max(0,Math.min(2,Number(p.maxRetries)||0));attempt++){try{const raw=await this.timeout(()=>p.adapter.execute(task,{attempt,providerId}),p.timeoutMs||task.targetLatencyMs);const result=normalizeResult(providerId,task,raw,started,'completed');const validation=this.reviewer.validate(task,result);if(!validation.valid){result.status='invalid';result.error=validation.reason;this.registry.markFailure(providerId,new Error(validation.reason));return result}this.registry.markSuccess(providerId,result.latencyMs);return result}catch(error){last=error;this.registry.markFailure(providerId,error,{cooldownMs:error?.code==='timeout'?10000:0});if(attempt<Number(p.maxRetries||0))await sleep(30*(attempt+1))}}return normalizeResult(providerId,task,{error:text(last?.message||last,500)},started,last?.code==='timeout'?'timeout':'failed')}
    async execute(rawTask,{leaderDecision=null}={}){const task=rawTask?.objective&&rawTask.capabilities?rawTask:createTask(rawTask);const route=this.router.route(task);const run={id:`multi-run-${this.now()}-${Math.random().toString(36).slice(2,7)}`,taskId:task.id,route:clone(route),status:'running',startedAt:this.now(),results:[],reviews:[]};this.runs.push(run);this.runs=this.runs.slice(-60);if(route.blockedExternal){run.status='blocked_external';run.finishedAt=this.now();return clone(run)}for(const providerId of [route.primary,...route.fallbacks]){const result=await this.invoke(providerId,task);run.results.push(result);if(result.status==='completed')break}const candidate=run.results.find(r=>r.status==='completed');if(!candidate){run.status=run.results.some(r=>r.status==='timeout')?'timeout':'failed';run.finishedAt=this.now();return clone(run)}if(task.reviewRequired){for(const reviewerId of route.reviewers.slice(0,2)){const review=await this.reviewer.independentReview({task,result:candidate,providerId:reviewerId,registry:this.registry,timeout:this.timeout.bind(this)});run.reviews.push({...review,candidateProviderId:candidate.providerId})}}const resolved=this.resolver.resolve(run.results,run.reviews,leaderDecision);run.status=resolved.status;run.winner=clone(resolved.winner);run.resolution=resolved.reason;run.finishedAt=this.now();return clone(run)}
    snapshot(){return {leader:'chatgpt',registry:this.registry.snapshot(),runs:clone(this.runs)}}
  }

  return Object.freeze({version:'5.0.0',PROVIDER_CATALOG,ROUTING_PROFILES,ProviderRegistry,ModelRouter,AgentReviewer,ConflictResolver,MultiAgentCoordinator,createTask});
});
