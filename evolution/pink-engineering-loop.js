// Pink Engineering Evolution Loop V1 — candidate -> plan -> approval -> isolated lab -> review.
// Never merges main or publishes production autonomously.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkEngineering=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const VERSION='1.0.0';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const runs=[];
const now=()=>new Date().toISOString();
const slug=v=>String(v||'improvement').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,44)||'improvement';
function evolution(){return root.PinkAutonomousEvolution||null}
function studio(){return root.PinkStudio||null}
function autonomyLevel(){return Number(root.PinkAutonomy?.getLevel?.()??0)}
function candidates(){try{return evolution()?.snapshot?.().candidates||[]}catch(_){return []}}
function resolveCandidate(value){if(value&&typeof value==='object'&&value.id)return clone(value);const id=String(value||'');return clone(candidates().find(c=>c.id===id)||null)}
function actionId(candidate){return `pink-engineering:${candidate.id}:branch`}
function branchName(candidate){return `evolution/${slug(candidate.kind)}-${slug(candidate.title).slice(0,24)}-${String(candidate.id).slice(-6)}`}
function goalFor(candidate){return [`Melhoria controlada da Pink LPS Studio.`,`Candidato: ${candidate.title}.`,`Tipo: ${candidate.kind||'improvement'}.`,`Evidências: ${(candidate.evidence||[]).join(' | ')||'não informadas'}.`,`Implemente somente em branch isolada, preserve compatibilidade, execute testes e gere diff/revisão.`,`Não faça merge em main e não publique produção.`].join('\n')}
function prepare(value){const candidate=resolveCandidate(value);if(!candidate)return {status:'not_found',reason:'candidate_not_found'};return {status:'prepared',candidate,goal:goalFor(candidate),branchName:branchName(candidate),risk:'EXTERNAL_WRITE',actionId:actionId(candidate),requiredAutonomy:3,publish:false,policy:'LAB_FIRST_NO_SELF_PUBLISH'}}
function propose(signal={}){const candidate=evolution()?.observe?.(signal)||null;if(candidate)root.PinkEvolution?.recordSession?.(`engineering-candidate:${candidate.id}`);return candidate?{status:'candidate',candidate,packet:prepare(candidate)}:{status:'ignored',reason:'signal_not_actionable'}}
function approvalGate(packet,approval){const foundation=root.PinkFoundation;if(!foundation?.approval?.canExecute)return {allowed:false,reason:'approval_engine_unavailable'};return foundation.approval.canExecute({id:packet.actionId,risk:'EXTERNAL_WRITE',capability:'pink-engineering.runLab'},approval||null)}
async function runLab(value,options={}){const packet=prepare(value);if(packet.status!=='prepared')return packet;const run={id:`eng_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,candidateId:packet.candidate.id,status:'created',branch:packet.branchName,startedAt:now(),endedAt:null,studioRun:null,reason:null};runs.push(run);
 if(autonomyLevel()<3){run.status='needs_autonomy_level';run.reason='N3_required_for_external_write';run.endedAt=now();return clone({...run,requiredAutonomy:3})}
 const gate=approvalGate(packet,options.approval);if(!gate.allowed){run.status='needs_approval';run.reason=gate.reason||'approval_required';run.endedAt=now();return clone({...run,actionId:packet.actionId,risk:'EXTERNAL_WRITE',approval:gate})}
 if(!studio()?.run){run.status='blocked_external';run.reason='pink_studio_unavailable';run.endedAt=now();return clone(run)}
 const result=await studio().run(packet.goal,{risk:'EXTERNAL_WRITE',approved:true,publish:false,branchName:packet.branchName,context:options.context||root.PinkOperatingCore?.snapshot?.()||{}});
 run.studioRun=result;run.endedAt=now();
 if(result?.status==='completed'){run.status='ready_for_review';evolution()?.engine?.recordLearning?.({kind:'engineering_lab',candidateId:packet.candidate.id,result:'ready_for_review',branch:result.branch||packet.branchName,tests:result.tests||[],review:result.review||[]});root.PinkEvolution?.recordSession?.(`engineering-ready:${packet.candidate.id}`)}
 else{run.status=result?.status||'failed';run.reason=result?.steps?.find?.(s=>s.status==='failed'||s.status==='blocked_external')?.name||null;evolution()?.engine?.recordLearning?.({kind:'engineering_lab',candidateId:packet.candidate.id,result:run.status,reason:run.reason})}
 root.dispatchEvent?.(new CustomEvent('pinkengineering:run',{detail:clone(run)}));return clone(run)}
async function runTop(options={}){const candidate=evolution()?.prioritize?.(1)?.[0];if(!candidate)return {status:'idle',reason:'no_prioritized_candidate'};return runLab(candidate,options)}
function snapshot(){return {version:VERSION,policy:'LAB_FIRST_NO_SELF_PUBLISH',autonomyLevel:autonomyLevel(),candidates:candidates(),runs:clone(runs.slice(-30)),blockedActions:['merge_main','publish_production','change_credentials','change_billing','weaken_security']}}
function registerReadCapabilities(){const registry=root.PinkOperatingCore?.capabilities;if(!registry)return;const safe=(name,handler,description)=>{if(registry.has?.(name))return;try{registry.register({name,risk:'READ_ONLY',timeoutMs:5000,maxRetries:0,handler,description})}catch(_){}};safe('engineering.prepare',async input=>prepare(input?.candidateId||input?.candidate),'Prepare an autonomous evolution candidate for isolated engineering work.');safe('engineering.snapshot',async()=>snapshot(),'Read the Pink engineering evolution pipeline state.')}
function observeProviderEvent(event){const d=event?.detail||{};if(!['failed','blocked_external','all_failed'].includes(String(d.status)))return;propose({type:'provider_failure',title:`Falha recorrente no provedor ${d.provider||d.capability||'IA'}`,evidence:d.error||d.reason||JSON.stringify(d.attempts||[]).slice(0,500),impact:.7,confidence:.85,risk:.2,effort:.35})}
function boot(){registerReadCapabilities();root.addEventListener?.('pinkai:provider-result',observeProviderEvent);root.addEventListener?.('pinkplatform:ready',registerReadCapabilities);root.dispatchEvent?.(new CustomEvent('pinkengineering:ready',{detail:snapshot()}))}
if(typeof window!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else queueMicrotask(boot)}
return {version:VERSION,propose,prepare,runLab,runTop,snapshot,resolveCandidate,actionId,branchName};
});
