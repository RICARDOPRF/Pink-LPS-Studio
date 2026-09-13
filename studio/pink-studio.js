// Pink Phase 6 — Pink Studio: controlled developer workflow, no generic shell.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkStudio=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const terminal=new Set(['completed','failed','cancelled','timeout','blocked_external','needs_approval']);
class AdapterRegistry{
 constructor(){this.map=new Map()}
 register(name,adapter){if(!name||!adapter)throw new Error('studio_adapter_required');this.map.set(name,adapter);return true}
 get(name){return this.map.get(name)||null}
 has(name,method){const a=this.get(name);return Boolean(a&&typeof a[method]==='function')}
 list(){return [...this.map.keys()]}
}
class StudioRun{
 constructor(goal){this.id=`studio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;this.goal=String(goal||'').trim();this.status='created';this.startedAt=new Date().toISOString();this.endedAt=null;this.project=null;this.repo=null;this.branch=null;this.steps=[];this.diff=null;this.preview=null;this.tests=[];this.review=[];this.release=null;this.risks=[]}
 step(name,status='completed',data={}){this.steps.push({name,status,at:new Date().toISOString(),...clone(data)});return this}
 finish(status){if(!terminal.has(status))throw new Error('studio_terminal_status_required');this.status=status;this.endedAt=new Date().toISOString();return this}
 snapshot(){return clone(this)}
}
class PinkStudioEngine{
 constructor({adapters=new AdapterRegistry(),approval=null}={}){this.adapters=adapters;this.approval=approval;this.runs=new Map()}
 create(goal){if(!goal)throw new Error('studio_goal_required');const run=new StudioRun(goal);this.runs.set(run.id,run);return run}
 async call(run,adapter,method,args=[],required=true){const target=this.adapters.get(adapter);if(!target||typeof target[method]!=='function'){if(required){run.step(`${adapter}.${method}`,'blocked_external');throw Object.assign(new Error(`studio_adapter_unavailable:${adapter}.${method}`),{code:'BLOCKED_EXTERNAL'})}return null}const value=await target[method](...args);run.step(`${adapter}.${method}`,'completed');return value}
 async execute(goal,options={}){
  const run=this.create(goal);run.status='running';
  try{
   const context=options.context||globalThis.PinkOperatingCore?.snapshot?.()||{};
   run.project=await this.call(run,'project','resolve',[goal,context],false)||context.awareness?.activeProject||null;
   run.repo=await this.call(run,'repo','resolve',[run.project,goal,context],false)||run.project?.repo||null;
   if(!run.repo)throw Object.assign(new Error('studio_repo_unresolved'),{code:'BLOCKED_EXTERNAL'});
   const risk=options.risk||'REVERSIBLE';run.risks.push(risk);
   if(['EXTERNAL_WRITE','DESTRUCTIVE','PRODUCTION'].includes(risk)&&!options.approved){run.step('approval','needs_approval',{risk});return run.finish('needs_approval').snapshot()}
   run.branch=await this.call(run,'git','createBranch',[run.repo,options.branchName||`pink/${Date.now().toString(36)}`]);
   const analysis=await this.call(run,'code','analyze',[run.repo,run.branch,goal,context]);
   const plan=await this.call(run,'planner','plan',[goal,analysis,context],false)||{goal,steps:[]};
   const changes=await this.call(run,'code','edit',[run.repo,run.branch,plan]);
   run.diff=await this.call(run,'code','diff',[run.repo,run.branch,changes],false)||changes?.diff||null;
   run.tests=await this.call(run,'tests','run',[run.repo,run.branch,plan],false)||[];
   if(run.tests.some?.(x=>x.status==='failed'))return run.finish('failed').snapshot();
   run.review=await this.call(run,'review','review',[{goal,analysis,plan,diff:run.diff,tests:run.tests}],false)||[];
   run.preview=await this.call(run,'preview','create',[run.repo,run.branch],false)||null;
   if(options.publish===true){if(!options.approved){run.step('publish','needs_approval');return run.finish('needs_approval').snapshot()}run.release=await this.call(run,'release','publish',[run.repo,run.branch,{preview:run.preview,diff:run.diff,tests:run.tests}])}
   return run.finish('completed').snapshot();
  }catch(error){run.step('error','failed',{message:String(error?.message||error)});return run.finish(error?.code==='BLOCKED_EXTERNAL'?'blocked_external':'failed').snapshot()}
 }
 present(id){const run=this.runs.get(id);if(!run)return null;return {id:run.id,status:run.status,goal:run.goal,project:run.project,repo:run.repo,branch:run.branch,before:run.steps[0]||null,after:{diff:run.diff,preview:run.preview},tests:run.tests,review:run.review,risks:run.risks,release:run.release}}
 snapshot(){return {version:'6.0.0',adapters:this.adapters.list(),runs:[...this.runs.values()].map(x=>x.snapshot())}}
}
const adapters=new AdapterRegistry();
const engine=new PinkStudioEngine({adapters});
return {version:'6.0.0',adapters,engine,registerAdapter:(n,a)=>adapters.register(n,a),run:(goal,opts)=>engine.execute(goal,opts),present:id=>engine.present(id),snapshot:()=>engine.snapshot()};
});