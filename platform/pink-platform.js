// Pink consolidated runtime bridge for Phases 5-11 + V14 Agent Harness.
(() => {
  'use strict';
  const version='14.0.0';
  const safeRegister=(name,risk,handler,description='')=>{
    const registry=window.PinkOperatingCore?.capabilities;
    if(!registry||registry.has?.(name))return;
    try{registry.register({name,risk,timeoutMs:15000,maxRetries:0,handler,description})}catch(error){console.warn('Pink platform capability registration failed',name,error)}
  };
  function wire(){
    try{window.PinkAgentHarness?.bridgeTools?.()}catch(_){ }
    if(window.PinkTools&&window.PinkStudio){
      window.PinkStudio.registerAdapter('project',{resolve:(goal,context)=>window.PinkTools.resolveProject(goal,context)});
      window.PinkStudio.registerAdapter('repo',{resolve:async(project)=>project?.repo||null});
      window.PinkStudio.registerAdapter('planner',{plan:async(goal,analysis,context)=>({goal,analysis,context,steps:[]})});
    }
    safeRegister('agent.route','READ_ONLY',async input=>window.PinkMultiAgent?.route?.(input)||{blocked:true},'Route a task to a registered provider without invoking unavailable providers.');
    safeRegister('agent.invoke','EXTERNAL_WRITE',async input=>window.PinkMultiAgent?.invoke?.(input)||{status:'blocked_external'},'Invoke an attached provider through the multi-agent router.');
    safeRegister('agent-harness.snapshot','READ_ONLY',async()=>window.PinkAgentHarness?.snapshot?.()||null,'Read V14 plugin lifecycle, audit events and circuit-breaker state.');
    safeRegister('project.resolve','READ_ONLY',async input=>window.PinkTools?.resolveProject?.(input?.query||input?.name||'',input?.context||{})||null,'Resolve an LPS project by memory, aliases and runtime registry.');
    safeRegister('tool.invoke','EXTERNAL_WRITE',async input=>window.PinkAgentHarness?.invokeTool?.(input?.tool,input?.capability,input?.args||{},input?.context||{})||window.PinkTools?.invoke?.(input?.tool,input?.capability,input?.args||{},input?.context||{})||{status:'blocked_external'},'Invoke only declared Pink tool capabilities through the scoped V14 approval boundary.');
    safeRegister('studio.run','EXTERNAL_WRITE',async input=>window.PinkStudio?.run?.(input?.goal,input?.options||{})||{status:'blocked_external'},'Run Pink Studio through registered controlled adapters.');
    safeRegister('companion.invoke','EXTERNAL_WRITE',async input=>window.PinkCompanion?.invoke?.(input?.capability,input?.args||{},input?.context||{})||{status:'blocked'},'Invoke a capability-scoped Companion action; no shell exists.');
    safeRegister('evolution.snapshot','READ_ONLY',async()=>window.PinkAutonomousEvolution?.snapshot?.()||null,'Read autonomous evolution candidates and experiments.');
    safeRegister('engineering.prepare','READ_ONLY',async input=>window.PinkEngineering?.prepare?.(input?.candidateId||input?.candidate)||{status:'blocked_external'},'Prepare a Pink evolution candidate for isolated engineering work.');
    safeRegister('engineering.snapshot','READ_ONLY',async()=>window.PinkEngineering?.snapshot?.()||null,'Read the controlled engineering evolution pipeline state.');
    safeRegister('observability.snapshot','READ_ONLY',async()=>window.PinkObservability?.dashboard?.()||null,'Read Pink structured health and metrics.');
    safeRegister('enterprise.snapshot','READ_ONLY',async()=>window.PinkEnterprise?.snapshot?.()||null,'Read enterprise plans, RBAC and governance state.');
    try{
      window.PinkObservability?.setHealth?.('agent-harness',window.PinkAgentHarness?'healthy':'degraded',window.PinkAgentHarness?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('multi-agent',window.PinkMultiAgent?'healthy':'degraded',window.PinkMultiAgent?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('studio',window.PinkStudio?'healthy':'degraded',window.PinkStudio?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('tools',window.PinkTools?'healthy':'degraded',window.PinkTools?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('companion',window.PinkCompanion?.snapshot?.().connected?'healthy':'standby',window.PinkCompanion?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('evolution',window.PinkAutonomousEvolution?'healthy':'degraded',window.PinkAutonomousEvolution?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('engineering',window.PinkEngineering?'healthy':'degraded',window.PinkEngineering?.snapshot?.()||{});
      window.PinkObservability?.setHealth?.('enterprise',window.PinkEnterprise?'healthy':'degraded',window.PinkEnterprise?.snapshot?.()||{});
    }catch(_){ }
    window.PinkOperatingCore?.health?.recordExternal?.('platform-5-11',{version,status:'loaded'});
    window.dispatchEvent(new CustomEvent('pinkplatform:ready',{detail:{version}}));
  }
  window.PinkPlatform={version,wire,snapshot:()=>({version,agentHarness:window.PinkAgentHarness?.snapshot?.()||null,multiAgent:window.PinkMultiAgent?.snapshot?.()||null,studio:window.PinkStudio?.snapshot?.()||null,tools:window.PinkTools?.snapshot?.()||null,companion:window.PinkCompanion?.snapshot?.()||null,evolution:window.PinkAutonomousEvolution?.snapshot?.()||null,engineering:window.PinkEngineering?.snapshot?.()||null,observability:window.PinkObservability?.dashboard?.()||null,enterprise:window.PinkEnterprise?.snapshot?.()||null})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else queueMicrotask(wire);
})();
