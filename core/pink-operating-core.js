// Pink Phase 1 — Core Intelligence.
// Typed capabilities only: this runtime cannot execute arbitrary model-generated shell/Python/code.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    root.PinkCoreIntelligence = api;
    const boot = () => {
      if (root.PinkOperatingCore || !root.PinkFoundation) return root.PinkOperatingCore || null;
      const core = api.create({ foundation: root.PinkFoundation });
      core.capabilities.register({
        name: 'context.snapshot', risk: 'READ_ONLY', timeoutMs: 1000, maxRetries: 0,
        handler: async () => ({ awareness: core.awareness.snapshot(), context: core.context.snapshot() })
      });
      core.capabilities.register({
        name: 'health.snapshot', risk: 'READ_ONLY', timeoutMs: 1000, maxRetries: 0,
        handler: async () => core.health.snapshot()
      });
      root.PinkOperatingCore = core;
      root.dispatchEvent(new CustomEvent('pinkcoreintelligence:ready', { detail: core.snapshot() }));
      return core;
    };
    root.addEventListener('pinkfoundation:ready', boot, { once: true });
    root.addEventListener('pinkui:mode-change', event => {
      const core = root.PinkOperatingCore;
      if (!core) return;
      core.context.setActive(event?.detail?.context || null, { source: 'pink-ui', mode: event?.detail?.mode || null });
    });
    root.addEventListener('pinkruntime:health', event => {
      root.PinkOperatingCore?.health?.recordExternal?.('visual-runtime', event?.detail || {});
    });
    queueMicrotask(boot);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TERMINAL = new Set(['completed','failed','cancelled','timeout','blocked_external']);
  const RISK_RANK = Object.freeze({ READ_ONLY:0, REVERSIBLE:1, EXTERNAL_WRITE:2, DESTRUCTIVE:3, PRODUCTION:4 });
  const TASK_TRANSITIONS = Object.freeze({
    pending: new Set(['running','cancelled']),
    running: new Set(['completed','failed','cancelled','timeout','blocked_external']),
    completed: new Set(), failed: new Set(), cancelled: new Set(), timeout: new Set(), blocked_external: new Set()
  });
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const text = (value, max = 300) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  class EventLog {
    constructor(limit = 80, now = () => Date.now()) { this.limit = Math.max(10, limit); this.now = now; this.items = []; }
    push(type, detail = {}) {
      this.items.push({ at: this.now(), type: text(type,60), ...clone(detail) });
      this.items = this.items.slice(-this.limit);
      return this.snapshot();
    }
    snapshot() { return clone(this.items); }
  }

  class AwarenessEngine {
    constructor({ now = () => Date.now() } = {}) {
      this.now = now;
      this.events = new EventLog(60, now);
      this.state = {
        activeProject:null, activeContext:null, currentGoal:null, currentTask:null,
        currentAgent:'chatgpt-supervisor', currentTool:null, currentBranch:null,
        currentPreview:null, lastAction:null, lastVerifiedAction:null, lastError:null,
        updatedAt:now()
      };
    }
    update(patch = {}, eventType = 'awareness-update') {
      const allowed = Object.keys(this.state).filter(key => key !== 'updatedAt');
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(patch,key)) this.state[key] = clone(patch[key]);
      this.state.updatedAt = this.now();
      this.events.push(eventType, patch);
      return this.snapshot();
    }
    setGoal(goal) { return this.update({ currentGoal:text(goal,500) }, 'goal'); }
    verified(action) { return this.update({ lastAction:clone(action), lastVerifiedAction:clone(action), lastError:null }, 'verified-action'); }
    error(error) { return this.update({ lastError:text(error?.message || error,500) }, 'error'); }
    snapshot() { return { ...clone(this.state), recentEvents:this.events.snapshot() }; }
  }

  class ContextManager {
    constructor(awareness) { this.awareness = awareness; this.active = null; this.history = []; }
    setActive(context, metadata = {}) {
      if (this.active) this.history.push({ context:clone(this.active), leftAt:Date.now() });
      this.active = context ? { ...clone(context), metadata:{ ...(clone(context.metadata)||{}), ...clone(metadata) } } : null;
      this.history = this.history.slice(-20);
      this.awareness.update({ activeContext:this.active, activeProject:this.active?.project || this.active?.projectId || null }, 'context-switch');
      return this.snapshot();
    }
    clear() { return this.setActive(null, { reason:'clear' }); }
    snapshot() { return { active:clone(this.active), history:clone(this.history) }; }
  }

  class TaskManager {
    constructor({ now = () => Date.now() } = {}) { this.now=now; this.tasks=new Map(); this.sequence=0; }
    create(input = {}) {
      const id = String(input.id || `task-${this.now()}-${++this.sequence}`);
      if (this.tasks.has(id)) throw new Error(`duplicate_task:${id}`);
      const task = { id, title:text(input.title||input.objective,300), status:'pending', createdAt:this.now(), startedAt:null, finishedAt:null, metadata:clone(input.metadata||{}), error:null };
      this.tasks.set(id,task); return this.get(id);
    }
    transition(id,next,detail={}) {
      const task=this.tasks.get(String(id)); if(!task) throw new Error(`unknown_task:${id}`);
      if(!TASK_TRANSITIONS[task.status]?.has(next)) throw new Error(`invalid_task_transition:${task.status}->${next}`);
      task.status=next;
      if(next==='running') task.startedAt=this.now();
      if(TERMINAL.has(next)) task.finishedAt=this.now();
      task.error=detail.error?text(detail.error,500):task.error;
      return this.get(id);
    }
    get(id){const value=this.tasks.get(String(id));return value?clone(value):null}
    list(){return [...this.tasks.values()].map(clone)}
  }

  class ErrorManager {
    constructor(awareness,{now=()=>Date.now()}={}){this.awareness=awareness;this.now=now;this.errors=[]}
    capture(error,context={}){
      const item={at:this.now(),message:text(error?.message||error,600),code:text(error?.code||context.code||'error',80),context:clone(context)};
      this.errors.push(item);this.errors=this.errors.slice(-60);this.awareness.error(item.message);return clone(item)
    }
    snapshot(){return clone(this.errors)}
  }

  class HealthEngine {
    constructor(){this.components=new Map();this.external=new Map()}
    set(name,status,detail={}){this.components.set(String(name),{status:String(status),detail:clone(detail),at:Date.now()});return this.snapshot()}
    recordExternal(name,detail={}){this.external.set(String(name),{...clone(detail),at:Date.now()});return this.snapshot()}
    snapshot(){
      const components=Object.fromEntries([...this.components.entries()].map(([k,v])=>[k,clone(v)]));
      const external=Object.fromEntries([...this.external.entries()].map(([k,v])=>[k,clone(v)]));
      const degraded=Object.values(components).some(item=>['failed','error','degraded'].includes(item.status));
      return {status:degraded?'degraded':'ok',components,external};
    }
  }

  class CapabilityRegistry {
    constructor(){this.items=new Map()}
    register(input={}){
      const name=text(input.name,120); if(!/^[a-z0-9][a-z0-9._:-]*$/i.test(name)) throw new Error('invalid_capability_name');
      if(typeof input.handler!=='function') throw new Error(`capability_handler_required:${name}`);
      if(this.items.has(name)) throw new Error(`duplicate_capability:${name}`);
      const item={
        name, risk:String(input.risk||'READ_ONLY').toUpperCase(), timeoutMs:Math.max(50,Number(input.timeoutMs)||5000),
        maxRetries:Math.max(0,Math.min(3,Number(input.maxRetries)||0)), handler:input.handler,
        fallback:typeof input.fallback==='function'?input.fallback:null, description:text(input.description,300)
      };
      this.items.set(name,item); return this.describe(name);
    }
    has(name){return this.items.has(String(name))}
    get(name){return this.items.get(String(name))||null}
    describe(name){const item=this.get(name);if(!item)return null;const {handler,fallback,...safe}=item;return clone({...safe,hasFallback:Boolean(fallback)})}
    list(){return [...this.items.keys()].map(name=>this.describe(name))}
  }

  class Planner {
    constructor({capabilities,foundation,awareness}){this.capabilities=capabilities;this.foundation=foundation;this.awareness=awareness;this.sequence=0}
    createPlan(objective, options={}){
      const goal=text(objective,700); if(!goal) throw new Error('objective_required');
      const requested=Array.isArray(options.steps)?options.steps:Array.isArray(options.capabilities)?options.capabilities.map(capability=>({capability})):[];
      const unknown=[];
      const steps=requested.map((raw,index)=>{
        const step=typeof raw==='string'?{capability:raw}:raw||{};
        const name=String(step.capability||''); const descriptor=this.capabilities.describe(name);
        if(!descriptor) unknown.push(name||`step-${index+1}`);
        const risk=this.foundation?.normalizeRisk?this.foundation.normalizeRisk(step.risk||descriptor?.risk||'READ_ONLY'):String(step.risk||descriptor?.risk||'READ_ONLY');
        return { id:`step-${index+1}`, capability:name, input:clone(step.input||{}), risk, optional:Boolean(step.optional), dependsOn:clone(step.dependsOn||[]), timeoutMs:descriptor?.timeoutMs||null };
      });
      const plan={
        id:`plan-${Date.now()}-${++this.sequence}`, objective:goal, createdAt:Date.now(),
        valid:unknown.length===0 && steps.length>0, unknownCapabilities:unknown, steps,
        dependencies:clone(options.dependencies||[]), metadata:clone(options.metadata||{})
      };
      this.awareness.setGoal(goal);
      this.awareness.events.push('plan-created',{planId:plan.id,valid:plan.valid,steps:steps.length,unknown});
      return clone(plan);
    }
  }

  class RecoveryEngine {
    constructor({errorManager}){this.errorManager=errorManager}
    async withTimeout(fn,timeoutMs){
      let timer;
      try{return await Promise.race([
        Promise.resolve().then(fn),
        new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('capability_timeout');error.code='timeout';reject(error)},timeoutMs)})
      ])}finally{clearTimeout(timer)}
    }
    async execute(descriptor, input, runtimeContext={}){
      const attempts=[];
      const maxAttempts=1+descriptor.maxRetries;
      for(let attempt=1;attempt<=maxAttempts;attempt++){
        const started=Date.now();
        try{
          const value=await this.withTimeout(()=>descriptor.handler(clone(input),runtimeContext),descriptor.timeoutMs);
          attempts.push({attempt,status:'completed',ms:Date.now()-started});
          return {ok:true,value,attempts,recovered:attempt>1,via:'primary'};
        }catch(error){
          attempts.push({attempt,status:error?.code==='timeout'?'timeout':'failed',message:text(error?.message||error,300),ms:Date.now()-started});
          this.errorManager.capture(error,{capability:descriptor.name,attempt});
          if(attempt<maxAttempts) await sleep(Math.min(250,40*attempt));
        }
      }
      if(descriptor.fallback){
        try{
          const value=await this.withTimeout(()=>descriptor.fallback(clone(input),runtimeContext),descriptor.timeoutMs);
          attempts.push({attempt:'fallback',status:'completed'});
          return {ok:true,value,attempts,recovered:true,via:'fallback'};
        }catch(error){
          attempts.push({attempt:'fallback',status:error?.code==='timeout'?'timeout':'failed',message:text(error?.message||error,300)});
          this.errorManager.capture(error,{capability:descriptor.name,fallback:true});
        }
      }
      return {ok:false,attempts,recovered:false,via:null};
    }
  }

  class ReplanEngine {
    create(plan, failedStep, recovery){
      const failedIndex=plan.steps.findIndex(step=>step.id===failedStep.id);
      return {
        sourcePlanId:plan.id, reason:'step-failed', failedStep:clone(failedStep),
        attempts:clone(recovery?.attempts||[]), remaining:clone(plan.steps.slice(failedIndex+1)),
        recommendation: failedStep.optional?'continue-without-optional-step':'requires-new-capability-or-user-action'
      };
    }
  }

  function highestPlanRisk(steps=[]){
    return steps.reduce((current,step)=>{
      const next=String(step?.risk||'READ_ONLY').toUpperCase();
      return (RISK_RANK[next]??0)>(RISK_RANK[current]??0)?next:current;
    },'READ_ONLY');
  }

  class Executor {
    constructor({foundation,capabilities,awareness,tasks,recovery,replan,errors,health}){
      Object.assign(this,{foundation,capabilities,awareness,tasks,recovery,replan,errors,health});
    }
    approvalFor(step, approvals={}){return approvals[step.id]||approvals[step.capability]||null}
    async execute(plan,{approvals={},signal=null}={}){
      if(!plan?.valid) throw new Error(`invalid_plan:${(plan?.unknownCapabilities||[]).join(',')}`);
      const ledger=this.foundation?.ledger;
      const run=ledger?.start({phase:1,task:plan.objective,risk:highestPlanRisk(plan.steps),metadata:{planId:plan.id}});
      const task=this.tasks.create({title:plan.objective,metadata:{planId:plan.id}});this.tasks.transition(task.id,'running');
      this.awareness.update({currentTask:task.id},'execution-start');
      const results=[];
      try{
        for(const step of plan.steps){
          if(signal?.aborted){this.tasks.transition(task.id,'cancelled');ledger?.finish(run.id,'cancelled');return {status:'cancelled',results}}
          const descriptor=this.capabilities.get(step.capability);
          if(!descriptor) throw new Error(`unknown_capability:${step.capability}`);
          const action={id:`${plan.id}:${step.id}`,risk:step.risk,capability:step.capability,input:step.input};
          const gate=this.foundation?.approval?.canExecute(action,this.approvalFor(step,approvals));
          if(gate && !gate.allowed){
            const blocked={step:step.id,capability:step.capability,status:'blocked_external',reason:gate.reason};results.push(blocked);
            this.tasks.transition(task.id,'blocked_external',{error:gate.reason});ledger?.addEvidence(run.id,{type:'approval-block',value:blocked});ledger?.finish(run.id,'blocked_external',{error:gate.reason});
            this.awareness.update({lastAction:action,currentTool:null},'approval-blocked');return {status:'blocked_external',results,approvalRequired:true};
          }
          this.awareness.update({currentTool:step.capability,lastAction:action},'step-start');
          const execution=await this.recovery.execute(descriptor,step.input,{plan:clone(plan),step:clone(step),signal});
          ledger?.addEvidence(run.id,{type:'step',value:{step:step.id,capability:step.capability,ok:execution.ok,via:execution.via,attempts:execution.attempts}});
          if(!execution.ok){
            const replanned=this.replan.create(plan,step,execution);
            results.push({step:step.id,capability:step.capability,status:'failed',replan:replanned});
            if(step.optional) continue;
            this.tasks.transition(task.id,'failed',{error:'capability_failed'});ledger?.finish(run.id,'failed',{error:'capability_failed'});this.health.set('executor','degraded',{step:step.id});
            return {status:'failed',results,replan:replanned};
          }
          const result={step:step.id,capability:step.capability,status:'completed',value:clone(execution.value),recovered:execution.recovered,via:execution.via};results.push(result);
          this.awareness.verified(action);this.awareness.update({currentTool:null},'step-complete');
        }
        this.tasks.transition(task.id,'completed');ledger?.finish(run.id,'completed',{evidence:`${results.length} steps completed`});this.health.set('executor','ok',{lastPlan:plan.id});
        return {status:'completed',results};
      }catch(error){
        this.errors.capture(error,{planId:plan.id});
        const current=this.tasks.get(task.id);if(current?.status==='running')this.tasks.transition(task.id,error?.code==='timeout'?'timeout':'failed',{error:error.message});
        const liveRun=run&&ledger?.get(run.id);if(liveRun?.status==='running')ledger.finish(run.id,error?.code==='timeout'?'timeout':'failed',{error:error.message});
        this.health.set('executor','degraded',{error:text(error.message,300)});throw error;
      }finally{this.awareness.update({currentTask:null,currentTool:null},'execution-finish')}
    }
  }

  function create({foundation,now=()=>Date.now()}={}){
    if(!foundation) throw new Error('pink_foundation_required');
    const awareness=new AwarenessEngine({now});
    const context=new ContextManager(awareness);
    const tasks=new TaskManager({now});
    const errors=new ErrorManager(awareness,{now});
    const health=new HealthEngine();
    const capabilities=new CapabilityRegistry();
    const planner=new Planner({capabilities,foundation,awareness});
    const recovery=new RecoveryEngine({errorManager:errors});
    const replan=new ReplanEngine();
    const executor=new Executor({foundation,capabilities,awareness,tasks,recovery,replan,errors,health});
    health.set('foundation',foundation.health?.().ok?'ok':'degraded',foundation.health?.()||{});
    health.set('planner','ok');health.set('executor','ok');
    return Object.freeze({
      version:'1.0.0',awareness,context,tasks,errors,health,capabilities,planner,recovery,replan,executor,
      plan:(objective,options)=>planner.createPlan(objective,options),
      execute:(plan,options)=>executor.execute(plan,options),
      snapshot:()=>({version:'1.0.0',awareness:awareness.snapshot(),context:context.snapshot(),tasks:tasks.list(),health:health.snapshot(),capabilities:capabilities.list(),errors:errors.snapshot()})
    });
  }

  return Object.freeze({
    version:'1.0.0', create, AwarenessEngine, ContextManager, TaskManager, ErrorManager,
    HealthEngine, CapabilityRegistry, Planner, RecoveryEngine, ReplanEngine, Executor, highestPlanRisk
  });
});
