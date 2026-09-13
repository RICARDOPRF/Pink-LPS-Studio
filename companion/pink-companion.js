// Pink Phase 8 — Companion capability-scoped bridge. No shell capability exists.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkCompanion=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const CAPS={
'screen.capture':{risk:'READ_ONLY',approval:false},'app.open':{risk:'REVERSIBLE',approval:false},'window.focus':{risk:'REVERSIBLE',approval:false},'file.read':{risk:'READ_ONLY',approval:false},'file.write':{risk:'EXTERNAL_WRITE',approval:true},'folder.list':{risk:'READ_ONLY',approval:false},'clipboard.read':{risk:'READ_ONLY',approval:true},'clipboard.write':{risk:'EXTERNAL_WRITE',approval:true},'input.type':{risk:'EXTERNAL_WRITE',approval:true},'notification.send':{risk:'REVERSIBLE',approval:false},'device.status':{risk:'READ_ONLY',approval:false},
'voice.local.health':{risk:'READ_ONLY',approval:false},'voice.local.listen':{risk:'REVERSIBLE',approval:false},'voice.local.speak':{risk:'REVERSIBLE',approval:false},'voice.local.wake':{risk:'REVERSIBLE',approval:false}
};
class PermissionSet{
 constructor({roots=[],capabilities=[]}={}){this.roots=[...roots];this.caps=new Set(capabilities.filter(x=>CAPS[x]))}
 allow(cap){this.caps.add(cap);return this}
 revoke(cap){this.caps.delete(cap);return this}
 has(cap){return this.caps.has(cap)}
 inRoot(path=''){
  const normalize=value=>{const p=String(value).replace(/\\/g,'/');if(/[\x00-\x1f%]/.test(p)||p.startsWith('//')||!(/^(?:\/|[A-Za-z]:\/)/.test(p)))return null;if(p.split('/').some(part=>part==='.'||part==='..'))return null;return p.replace(/\/+$/,'')||'/'};
  const p=normalize(path);if(!p)return false;return this.roots.some(root=>{const r=normalize(root);return r!==null&&(p===r||p.startsWith(r==='/'?'/':r+'/'))});
 }
 snapshot(){return {capabilities:[...this.caps],roots:[...this.roots]}}
}
class CompanionBridge{
 constructor(){this.transport=null;this.permissions=new PermissionSet();this.connected=false;this.session=null;this.audit=[]}
 attachTransport(transport,{permissions,sessionToken,expiresAt}={}){if(!transport||typeof transport.request!=='function')throw new Error('companion_transport_required');if(!sessionToken)throw new Error('companion_session_token_required');const expiry=expiresAt==null?Date.now()+15*60*1000:Date.parse(expiresAt);if(!Number.isFinite(expiry)||expiry<=Date.now())throw new Error('companion_session_expired');this.transport=transport;this.permissions=permissions instanceof PermissionSet?permissions:new PermissionSet(permissions||{});this.session={token:sessionToken,expiresAt:new Date(expiry).toISOString()};this.connected=true;return this.snapshot()}
 disconnect(reason='manual'){this.connected=false;this.transport=null;this.session=null;this.log('disconnect',{reason});return true}
 log(event,data={}){this.audit.push({at:new Date().toISOString(),event,...clone(data)});this.audit=this.audit.slice(-200)}
 validate(cap,args={},context={}){if(!CAPS[cap])return {ok:false,reason:'capability_unknown'};if(!this.connected||!this.transport)return {ok:false,reason:'companion_disconnected'};if(!this.permissions.has(cap))return {ok:false,reason:'capability_not_authorized'};if(this.session?.expiresAt&&Date.parse(this.session.expiresAt)<=Date.now())return {ok:false,reason:'session_expired'};if((cap==='file.read'||cap==='file.write'||cap==='folder.list')&&!this.permissions.inRoot(args.path||args.root||''))return {ok:false,reason:'path_outside_authorized_roots'};if(CAPS[cap].approval&&!context.approved)return {ok:false,reason:'approval_required'};return {ok:true}}
 async invoke(cap,args={},context={}){const check=this.validate(cap,args,context);if(!check.ok){this.log('blocked',{cap,reason:check.reason});return {status:check.reason==='approval_required'?'needs_approval':'blocked',reason:check.reason,capability:cap}}this.log('request',{cap});try{const result=await Promise.race([Promise.resolve(this.transport.request({type:'pink-capability',capability:cap,args,sessionToken:this.session.token})),new Promise((_,reject)=>setTimeout(()=>reject(new Error('companion_timeout')),context.timeoutMs||15000))]);this.log('completed',{cap});return {status:'completed',capability:cap,result}}catch(error){this.log('failed',{cap,error:String(error?.message||error)});return {status:'failed',capability:cap,error:String(error?.message||error)}}}
 snapshot(){return {version:'8.1.0',connected:this.connected,session:this.session?{expiresAt:this.session.expiresAt}:null,permissions:this.permissions.snapshot(),capabilities:clone(CAPS),audit:this.audit.slice(-20)}}
}
const bridge=new CompanionBridge();return {version:'8.1.0',CAPABILITIES:clone(CAPS),PermissionSet,bridge,attach:(transport,opts)=>bridge.attachTransport(transport,opts),invoke:(cap,args,ctx)=>bridge.invoke(cap,args,ctx),disconnect:r=>bridge.disconnect(r),snapshot:()=>bridge.snapshot()};
});
