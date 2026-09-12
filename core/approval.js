(() => {
  'use strict';
  const HIGH_RISK=new Set(['publish','merge-main','delete','overwrite','billing','credential-change','security-weaken','send-message','send-email']),pending=new Map();
  const fingerprint=action=>{const src=JSON.stringify(action,Object.keys(action||{}).sort());let h=2166136261;for(let i=0;i<src.length;i++){h^=src.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
  const classify=(action={})=>{const type=String(action.type||action.action||'').toLowerCase();if(HIGH_RISK.has(type)||action.destructive===true||action.production===true)return'high';if(action.externalSideEffect===true)return'medium';return'low'};
  const requiresApproval=action=>classify(action)!=='low';
  const prepare=(action={})=>{const risk=classify(action),request={id:`approval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,fingerprint:fingerprint(action),risk,action:JSON.parse(JSON.stringify(action)),createdAt:Date.now(),expiresAt:Date.now()+600000,approved:false,consumed:false};pending.set(request.id,request);return{...request}};
  const approve=(id,action)=>{const req=pending.get(id);if(!req)throw new Error('approval_not_found');if(Date.now()>req.expiresAt)throw new Error('approval_expired');if(req.fingerprint!==fingerprint(action))throw new Error('approval_action_changed');req.approved=true;req.approvedAt=Date.now();return true};
  const consume=(id,action)=>{const req=pending.get(id);if(!req||!req.approved||req.consumed)return false;if(Date.now()>req.expiresAt||req.fingerprint!==fingerprint(action))return false;req.consumed=true;pending.delete(id);return true};
  window.PinkApproval={classify,requiresApproval,prepare,approve,consume};
})();
