// Pink Phase 5 — browser runtime bridge for secure provider adapters.
(() => {
  function boot(){
    const core=window.PinkMultiAgentCore;
    if(!core||window.PinkMultiAgent)return window.PinkMultiAgent||null;
    const registry=new core.ProviderRegistry();

    // NVIDIA is currently the only provider with a proven browser-safe backend path.
    if(window.PinkNVIDIA?.ask){
      registry.registerAdapter('nvidia',{
        async execute(task){
          const messages=Array.isArray(task?.input?.messages)?task.input.messages:[
            {role:'system',content:'Você é um especialista auxiliar da Pink. Responda em português do Brasil, com precisão, sem inventar acessos ou dados.'},
            {role:'user',content:String(task?.objective||'')}
          ];
          const result=await window.PinkNVIDIA.ask(messages,{temperature:.25,maxTokens:task?.input?.maxTokens||700});
          return {output:result?.reply||'',model:result?.model||null,usage:result?.usage||null,confidence:.72,metadata:{transport:'supabase-edge-function'}};
        }
      });
    }

    // Future secure backend/provider bridges may register here without changing router policy.
    const injected=window.PinkProviderAdapters&&typeof window.PinkProviderAdapters==='object'?window.PinkProviderAdapters:{};
    for(const [id,adapter] of Object.entries(injected)){
      if(registry.get(id)&&adapter&&typeof adapter.execute==='function'){
        try{registry.registerAdapter(id,adapter)}catch(error){window.PinkEvolution?.recordIssue?.(`provider-adapter:${id}`,error?.message||error)}
      }
    }

    const router=new core.ModelRouter({registry});
    const coordinator=new core.MultiAgentCoordinator({registry,router});
    const api={
      version:'5.0.0',leader:'chatgpt',registry,router,coordinator,
      task:core.createTask,
      route:input=>router.route(input?.objective?input:core.createTask(input)),
      execute:(input,options)=>coordinator.execute(input?.objective&&input.capabilities?input:core.createTask(input),options),
      provider:id=>registry.describe(id),
      providers:()=>registry.list(),
      snapshot:()=>coordinator.snapshot(),
      health:()=>({ok:true,leader:'chatgpt',available:registry.list().filter(p=>p.available).map(p=>p.id),unavailable:registry.list().filter(p=>!p.available).map(p=>p.id)})
    };
    window.PinkMultiAgent=api;
    window.PinkOperatingCore?.health?.recordExternal?.('multi-agent',api.health());
    window.dispatchEvent(new CustomEvent('pinkmultiagent:ready',{detail:api.health()}));
    return api;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else queueMicrotask(boot);
  window.addEventListener('load',boot,{once:true});
})();
