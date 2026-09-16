// Pink Intent + Context Router — converts natural requests into evidence-first execution plans.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkIntentRouter=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const RISK_ORDER=['READ_ONLY','REVERSIBLE','EXTERNAL_WRITE','DESTRUCTIVE','PRODUCTION'];
function riskMax(a='READ_ONLY',b='READ_ONLY'){return RISK_ORDER[Math.max(RISK_ORDER.indexOf(a),RISK_ORDER.indexOf(b))]||'READ_ONLY'}
class IntentContextRouter{
 constructor(){this.lastPlan=null}
 classify(text=''){
  const n=normalize(text);
  const cameraCapability=root.PinkCameraRouter?.classify?.(text)||null;
  if(cameraCapability)return 'camera';
  if(/(que horas|qual a hora|hora agora|horario agora|horario atual|que dia (e|é) hoje|qual a data|data de hoje|dia de hoje)/.test(n))return 'runtime_time';
  if(/(produtividade|avanco|desvio|hh|indicador|status do projeto|como esta)/.test(n))return 'project_metrics';
  if(/(pesquisa|pesquisar|procura na internet|busca na internet|internet|web|mercado|concorrente|norma|noticia|modelo nvidia|ultimo|ultima|mais recente|hoje aconteceu)/.test(n))return 'research';
  if(/(abre|abrir|mostra|mostrar|entra|acesse|vai para)/.test(n))return 'open_project';
  if(/(documento|arquivo|procedimento|memoria|historico|decisao|drive)/.test(n))return 'knowledge';
  if(/(melhora|corrige|ajusta|bug|implementar|codigo|menu|refator)/.test(n))return 'software_change';
  if(/(otimiz|rota|cronograma|aloca|sequencia|planejamento)/.test(n))return 'optimization';
  if(/(venda|lucro|produto|estoque|praia)/.test(n))return 'store';
  return 'general';
 }
 resolveProject(text=''){
  try{return root.PinkCore?.matchProject?.(text)||null}catch(_){return null}
 }
 activeProject(){
  try{return root.PinkOperatingCore?.snapshot?.().awareness?.activeProject||null}catch(_){return null}
 }
 plan(input,context={}){
  const text=String(input||'').trim();if(!text)throw new Error('intent_input_required');
  const intent=this.classify(text);const project=this.resolveProject(text)||context.activeProject||this.activeProject()||null;
  const steps=[];let risk='READ_ONLY';
  if(intent==='camera'){
    const capability=root.PinkCameraRouter?.classify?.(text)||'camera.status';
    steps.push({kind:'tool',tool:'camera',capability,args:{request:text,question:text}});
  }
  else if(intent==='runtime_time'){steps.push({kind:'tool',tool:'runtime-clock',capability:/(data|dia)/.test(normalize(text))?'date.current':'time.current',args:{request:text}})}
  else if(intent==='open_project'){steps.push({kind:'tool',tool:'painel-router',capability:'panel.open',args:{project:project||text}})}
  else if(intent==='project_metrics'){steps.push({kind:'tool',tool:'painel-router',capability:'project.metrics',args:{project:project||text,request:text}})}
  else if(intent==='research'){steps.push({kind:'ai',capability:'research',prompt:text})}
  else if(intent==='knowledge'){steps.push({kind:'ai',capability:'rag',prompt:text})}
  else if(intent==='software_change'){risk='EXTERNAL_WRITE';steps.push({kind:'ai',capability:'coding',prompt:text});steps.push({kind:'tool',tool:'github',capability:'branch.create',args:{project:project||null}});steps.push({kind:'tool',tool:'github',capability:'file.write',args:{project:project||null}})}
  else if(intent==='optimization'){steps.push({kind:'ai',capability:'optimization',prompt:text})}
  else if(intent==='store'){const write=/(alter|muda|troca|atualiza|exclui|cria|adiciona)/.test(normalize(text));risk=write?'EXTERNAL_WRITE':'READ_ONLY';steps.push({kind:'tool',tool:'store-router',capability:write?'store.prepare-write':'store.sales',args:{request:text}})}
  else steps.push({kind:'ai',capability:'reasoning',prompt:text});
  const plan={id:`plan_${Date.now()}`,intent,text,project,risk,steps,status:'planned',createdAt:new Date().toISOString()};this.lastPlan=plan;return JSON.parse(JSON.stringify(plan));
 }
 async invokeTool(step,approvalContext={}){
   if(root.PinkAgentHarness?.invokeTool)return root.PinkAgentHarness.invokeTool(step.tool,step.capability,step.args||{},approvalContext);
   if(!root.PinkAIGateway?.tool)return {status:'blocked_external',reason:'tool_gateway_unavailable'};
   const legacyApproved=approvalContext?.approvedByUi===true&&approvalContext?.approvalSource==='PinkConfirmGate'&&Boolean(approvalContext?.confirmationId);
   return root.PinkAIGateway.tool(step.tool,step.capability,step.args||{},{...approvalContext,approved:legacyApproved});
 }
 async execute(plan,context={}){
  if(!plan?.steps?.length)return {status:'failed',reason:'empty_plan'};
  const results=[];for(const step of plan.steps){
   let result;
   if(step.kind==='ai'){
    if(!root.PinkAIGateway?.invoke){result={status:'blocked_external',reason:'ai_gateway_unavailable'}}
    else result=await root.PinkAIGateway.invoke({kind:step.capability,prompt:step.prompt,context:{project:plan.project}});
   }else if(step.kind==='tool'){
    const highRisk=['EXTERNAL_WRITE','DESTRUCTIVE','PRODUCTION'].includes(plan.risk);
    if(highRisk&&root.PinkConfirmGate){
      result={status:'needs_approval',confirmation:root.PinkConfirmGate.requestConfirmation({title:`Confirmar ${step.capability}?`,actionId:`${step.tool}:${step.capability}`,detail:plan.text,run:approval=>this.invokeTool(step,approval)})};
    }else result=await this.invokeTool(step,context);
   }
   results.push({step,result});
   if(['failed','blocked_external','blocked'].includes(result?.status))break;
   if(result?.status==='needs_approval')break;
  }
  const status=results.some(x=>x.result?.status==='needs_approval')?'needs_approval':results.some(x=>['failed','blocked_external','blocked'].includes(x.result?.status))?'blocked': 'completed';
  return {status,planId:plan.id,intent:plan.intent,project:plan.project,results};
 }
 snapshot(){return {version:'1.2.0',lastPlan:this.lastPlan}}
}
const router=new IntentContextRouter();
return {version:'1.2.0',router,plan:(i,c)=>router.plan(i,c),execute:(p,c)=>router.execute(p,c),snapshot:()=>router.snapshot()};
});
