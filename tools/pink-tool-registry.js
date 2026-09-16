// Pink Phase 7 — Tools & LPS Operating Layer
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkTools=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const RISKS=new Set(['READ_ONLY','REVERSIBLE','EXTERNAL_WRITE','DESTRUCTIVE','PRODUCTION']);
const READ_CAPABILITY=/(?:^|\.)(?:read|search|list|health|metrics|catalog|sales|open|query|snapshot|status|current|observe|close)$/i;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function capabilityRisk(item={},capability=''){const explicit=item.capabilityRisks?.[capability];if(RISKS.has(explicit))return explicit;if(READ_CAPABILITY.test(String(capability)))return 'READ_ONLY';return RISKS.has(item.risk)?item.risk:'READ_ONLY'}
class ToolRegistry{
 constructor(){this.tools=new Map()}
 register(meta={}){if(!meta.name)throw new Error('tool_name_required');if(!RISKS.has(meta.risk||'READ_ONLY'))throw new Error('tool_risk_invalid');const previous=this.tools.get(meta.name)||{};const item={capabilities:[],capabilityRisks:{},read:true,write:false,auth:'external',health:'unknown',timeoutMs:15000,audit:true,adapter:null,...previous,...clone(meta)};this.tools.set(item.name,item);return this.public(item)}
 attach(name,adapter,health='healthy'){const item=this.tools.get(name);if(!item)throw new Error(`tool_unknown:${name}`);item.adapter=adapter;item.health=health;return this.public(item)}
 public(item){const {adapter,...rest}=item;return clone(rest)}
 get(name){const item=this.tools.get(name);return item?this.public(item):null}
 list(){return [...this.tools.values()].map(x=>this.public(x))}
 async invoke(name,capability,args={},context={}){const item=this.tools.get(name);if(!item)return {status:'blocked_external',reason:`tool_unknown:${name}`};if(!item.capabilities.includes(capability))return {status:'failed',reason:`capability_not_declared:${capability}`};const risk=capabilityRisk(item,capability);if(risk!=='READ_ONLY'&&!context.approved)return {status:'needs_approval',tool:name,capability,risk};if(!item.adapter||typeof item.adapter.invoke!=='function')return {status:'blocked_external',reason:`tool_adapter_unavailable:${name}`};try{const result=await Promise.race([Promise.resolve(item.adapter.invoke(capability,args,{...context,risk})),new Promise((_,reject)=>setTimeout(()=>reject(new Error('tool_timeout')),item.timeoutMs))]);item.health='healthy';return {status:'completed',tool:name,capability,risk,result}}catch(error){item.health='degraded';return {status:'failed',tool:name,capability,risk,error:String(error?.message||error)}}}
}
class ProjectDiscovery{
 constructor(registry){this.registry=registry}
 normalize(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
 known(){if(typeof window==='undefined')return [];return (window.PinkCore?.projects||[]).map(p=>clone(p))}
 async resolve(query,context={}){const q=this.normalize(query);const active=context.activeProject||window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||null;if(!q&&active)return active;
  try{const alias=await window.PinkMemoryCloud?.projects?.resolve?.(query);if(alias?.pink_projects)return alias.pink_projects}catch(_){ }
  const known=this.known();const direct=known.find(p=>this.normalize(p.id)===q||this.normalize(p.name)===q||(p.aliases||[]).some(a=>q.includes(this.normalize(a))||this.normalize(a).includes(q)));if(direct)return direct;
  const management=this.registry.tools.get('gestao-obras');if(management?.adapter){const res=await this.registry.invoke('gestao-obras','project.search',{query},{approved:false});if(res.status==='completed'&&res.result)return res.result}
  return null}
}
const registry=new ToolRegistry();
[
{name:'github',risk:'EXTERNAL_WRITE',read:true,write:true,auth:'connector',capabilities:['repo.search','repo.read','branch.create','file.write','pr.create','release.read']},
{name:'supabase',risk:'EXTERNAL_WRITE',read:true,write:true,auth:'connector',capabilities:['db.read','db.write','schema.read','storage.read','storage.write','health']},
{name:'firebase',risk:'EXTERNAL_WRITE',read:true,write:true,auth:'external',capabilities:['db.read','db.write','storage.read','storage.write','health']},
{name:'google-drive',risk:'EXTERNAL_WRITE',read:true,write:true,auth:'connector',capabilities:['file.search','file.read','file.write']},
{name:'email',risk:'EXTERNAL_WRITE',read:true,write:true,auth:'connector',capabilities:['mail.search','mail.read','mail.draft','mail.send']},
{name:'painel-router',risk:'READ_ONLY',read:true,write:false,auth:'runtime',capabilities:['panel.open','panel.query','project.metrics']},
{name:'store-router',risk:'EXTERNAL_WRITE',read:true,write:true,auth:'runtime',capabilities:['store.sales','store.catalog','store.prepare-write','store.execute-write']},
{name:'gestao-obras',risk:'READ_ONLY',read:true,write:false,auth:'runtime',capabilities:['project.search','project.list']},
{name:'runtime-clock',risk:'READ_ONLY',read:true,write:false,auth:'device',capabilities:['time.current','date.current']},
{name:'camera',risk:'READ_ONLY',read:true,write:false,auth:'browser-permission',capabilities:['camera.open','camera.close','camera.status','camera.observe']},
{name:'lps-website',risk:'READ_ONLY',read:true,write:false,auth:'public',capabilities:['open']},
{name:'calculadora',risk:'READ_ONLY',read:true,write:false,auth:'public',capabilities:['open']},
{name:'duoplanning',risk:'READ_ONLY',read:true,write:false,auth:'public',capabilities:['open']},
{name:'lps-prospect',risk:'READ_ONLY',read:true,write:false,auth:'public',capabilities:['open']},
{name:'cvm-pipe-control',risk:'READ_ONLY',read:true,write:false,auth:'public',capabilities:['open']}
].forEach(x=>registry.register(x));
function clockSnapshot(){
 const now=new Date();const locale='pt-BR';
 return {iso:now.toISOString(),timestamp:now.getTime(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,offsetMinutes:-now.getTimezoneOffset(),localDate:new Intl.DateTimeFormat(locale,{dateStyle:'full'}).format(now),localTime:new Intl.DateTimeFormat(locale,{timeStyle:'medium'}).format(now),localDateTime:new Intl.DateTimeFormat(locale,{dateStyle:'full',timeStyle:'medium'}).format(now)};
}
function attachBrowser(){if(typeof window==='undefined')return;
 registry.attach('runtime-clock',{invoke:async cap=>{const snap=clockSnapshot();if(cap==='time.current'||cap==='date.current')return snap;throw new Error('clock_capability_unavailable')}});
 if(window.PinkCameraRouter)registry.attach('camera',{invoke:(cap,args)=>window.PinkCameraRouter.invoke(cap,args)});
 if(window.PinkPanelRouter)registry.attach('painel-router',{invoke:async(cap,args)=>{if(cap==='panel.open')return window.PinkCore?.openProject?.(args.project||args.id);if(cap==='panel.query'||cap==='project.metrics')return window.PinkCore?.queryMetrics?.(args.project||args.id,args.request);throw new Error('panel_capability_unavailable')}});
 if(window.PinkStoreRouter)registry.attach('store-router',{invoke:async(cap,args)=>{const s=window.PinkStoreRouter;if(cap==='store.sales')return s.getSales?.(args);if(cap==='store.catalog')return s.getCatalog?.(args);if(cap==='store.prepare-write')return s.prepareWrite?.(args);if(cap==='store.execute-write')return s.executeWrite?.(args);throw new Error('store_capability_unavailable')}});
}
attachBrowser();
if(typeof window!=='undefined'){window.addEventListener('pinkplatform:modules-loaded',attachBrowser);window.addEventListener('pinkvision:state',attachBrowser)}
const projects=new ProjectDiscovery(registry);
return {version:'7.2.0',registry,projects,ToolRegistry,capabilityRisk,registerTool:m=>registry.register(m),attach:(n,a,h)=>registry.attach(n,a,h),invoke:(n,c,a,ctx)=>registry.invoke(n,c,a,ctx),resolveProject:(q,c)=>projects.resolve(q,c),snapshot:()=>({version:'7.2.0',tools:registry.list(),knownProjects:projects.known()})};
});
