// Pink confirmation gate: irreversible actions require a UI-issued human confirmation.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')root.PinkConfirmGate=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const TIMEOUT_MS=90_000;
const pending=new Map();
let onRequested=()=>{};
let onExpired=()=>{};
function setConfirmationHandlers({onRequested:requested,onExpired:expired}={}){if(typeof requested==='function')onRequested=requested;if(typeof expired==='function')onExpired=expired}
function makeId(){const rand=(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));return `confirm_${Date.now()}_${rand}`}
function requestConfirmation({title,detail='',run,actionId=null}={}){
  if(typeof run!=='function')throw new TypeError('requestConfirmation requires run()');
  const id=makeId();
  const entry={id,actionId:actionId||null,title:String(title||'Confirmar ação?'),detail:String(detail||''),run,createdAt:Date.now(),timer:null};
  entry.timer=setTimeout(()=>{if(pending.delete(id))onExpired({id,actionId:entry.actionId,title:entry.title})},TIMEOUT_MS);
  pending.set(id,entry);
  onRequested({id,actionId:entry.actionId,title:entry.title,detail:entry.detail,createdAt:entry.createdAt});
  return {id,actionId:entry.actionId,spokenReply:`Preciso da sua confirmação antes de continuar: ${entry.title}.`};
}
async function resolveFromUi(id){
  const entry=pending.get(String(id));
  if(!entry)throw new Error('confirmation_missing_or_expired');
  clearTimeout(entry.timer);pending.delete(String(id));
  const approval=Object.freeze({approvedByUi:true,approvalSource:'PinkConfirmGate',confirmationId:String(id),actionId:entry.actionId||null,approvedAt:Date.now()});
  return await entry.run(approval);
}
function cancelFromUi(id){const entry=pending.get(String(id));if(!entry)return false;clearTimeout(entry.timer);pending.delete(String(id));return true}
function pendingCount(){return pending.size}
function isPending(id){return pending.has(String(id))}
function snapshot(){return [...pending.values()].map(({run,timer,...x})=>({...x}))}
return Object.freeze({version:'1.1.0',TIMEOUT_MS,requestConfirmation,resolveFromUi,cancelFromUi,pendingCount,isPending,snapshot,setConfirmationHandlers});
});
