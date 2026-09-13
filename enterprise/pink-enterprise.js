// Pink Phase 11 — Product / Enterprise foundation
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkEnterprise=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const PLANS={personal:{workspaces:1,users:1,features:['voice','memory','tools-read']},studio:{workspaces:5,users:10,features:['voice','memory','tools-read','studio','multi-agent','audit']},enterprise:{workspaces:999,users:9999,features:['voice','memory','tools-read','studio','multi-agent','audit','rbac','sso','retention','regional','admin']}};
const ROLES={owner:['*'],admin:['workspace.manage','member.manage','integration.manage','audit.read','studio.run','tool.write','tool.read'],operator:['studio.run','tool.write','tool.read','audit.read'],analyst:['tool.read','audit.read'],viewer:['tool.read']};
class Entitlements{
 constructor(plan='personal'){this.plan=PLANS[plan]?plan:'personal'}
 can(feature){return PLANS[this.plan].features.includes(feature)}
 limits(){return clone(PLANS[this.plan])}
 setPlan(plan){if(!PLANS[plan])throw new Error('plan_unknown');this.plan=plan;return this.snapshot()}
 snapshot(){return {plan:this.plan,...this.limits()}}
}
class AccessControl{
 constructor(){this.context={tenantId:null,workspaceId:null,userId:null,role:'viewer'}}
 setContext(ctx={}){this.context={...this.context,...clone(ctx)};return this.snapshot()}
 can(permission){const allowed=ROLES[this.context.role]||[];return allowed.includes('*')||allowed.includes(permission)}
 enforce(permission,{tenantId,workspaceId}={}){if(tenantId&&this.context.tenantId&&tenantId!==this.context.tenantId)throw new Error('tenant_isolation_violation');if(workspaceId&&this.context.workspaceId&&workspaceId!==this.context.workspaceId)throw new Error('workspace_isolation_violation');if(!this.can(permission))throw new Error(`rbac_denied:${permission}`);return true}
 snapshot(){return clone(this.context)}
}
class DataGovernance{
 constructor(){this.retention={conversationsDays:90,auditDays:365,memoriesDays:null};this.requests=[]}
 setRetention(policy={}){this.retention={...this.retention,...clone(policy)};return clone(this.retention)}
 requestExport(scope){const item={id:`export_${Date.now().toString(36)}`,type:'export',scope:clone(scope),status:'prepared',createdAt:new Date().toISOString()};this.requests.push(item);return clone(item)}
 requestDeletion(scope){const item={id:`delete_${Date.now().toString(36)}`,type:'deletion',scope:clone(scope),status:'needs_approval',createdAt:new Date().toISOString(),irreversible:true};this.requests.push(item);return clone(item)}
 snapshot(){return {retention:clone(this.retention),requests:clone(this.requests)}}
}
class EnterpriseRuntime{
 constructor(){this.entitlements=new Entitlements('personal');this.rbac=new AccessControl();this.governance=new DataGovernance();this.sso={mode:'architecture-ready',providers:[],enforced:false};this.billing={mode:'abstraction-only',provider:null,usage:{}};this.regional={strategy:'single-region-current',preferredRegion:null};this.backup={strategy:'provider-managed-plus-export',lastVerifiedAt:null};}
 authorize(feature,permission,scope={}){if(feature&&!this.entitlements.can(feature))return {ok:false,reason:'plan_entitlement_denied'};try{if(permission)this.rbac.enforce(permission,scope);return {ok:true}}catch(error){return {ok:false,reason:String(error?.message||error)}}}
 usage(key,amount=1){this.billing.usage[key]=(this.billing.usage[key]||0)+Number(amount||0);return this.billing.usage[key]}
 setSSO(config={}){this.sso={...this.sso,...clone(config)};return clone(this.sso)}
 snapshot(){return {version:'11.0.0',plans:clone(PLANS),roles:clone(ROLES),entitlements:this.entitlements.snapshot(),context:this.rbac.snapshot(),governance:this.governance.snapshot(),sso:clone(this.sso),billing:clone(this.billing),regional:clone(this.regional),backup:clone(this.backup)}}
}
const runtime=new EnterpriseRuntime();
return {version:'11.0.0',PLANS:clone(PLANS),ROLES:clone(ROLES),runtime,authorize:(f,p,s)=>runtime.authorize(f,p,s),setPlan:p=>runtime.entitlements.setPlan(p),setContext:c=>runtime.rbac.setContext(c),requestExport:s=>runtime.governance.requestExport(s),requestDeletion:s=>runtime.governance.requestDeletion(s),snapshot:()=>runtime.snapshot()};
});