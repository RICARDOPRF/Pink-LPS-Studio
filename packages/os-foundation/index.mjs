import { RiskLevel, makeId } from '../contracts/index.mjs';

const RISK_NAMES=Object.freeze({0:'READ_ONLY',1:'LOW',2:'MEDIUM',3:'HIGH',4:'CRITICAL'});
const clean=(v,max=800)=>String(v??'').trim().slice(0,max);
const clone=(v)=>structuredClone(v);
const evidence=(items=[])=>Object.freeze((Array.isArray(items)?items:[]).slice(0,32).map(x=>typeof x==='string'?Object.freeze({id:clean(x,240)}):Object.freeze({id:clean(x?.id,240),source:clean(x?.source,500),type:clean(x?.type,100),summary:clean(x?.summary,800),sha:clean(x?.sha,120)})).filter(x=>x.id||x.source));

export class PinkOSRegistry {
  constructor(){ this.apps=new Map(); this.capabilities=new Map(); this.agents=new Map(); this.events=[]; }
  registerCapability(input={}){
    const id=clean(input.id,160), title=clean(input.title||id,180);
    if(!id||!title) throw new TypeError('capability requires id and title');
    const risk=Number.isFinite(input.risk)?input.risk:RiskLevel.LOW;
    if(!Object.values(RiskLevel).includes(risk)) throw new TypeError('invalid capability risk');
    const item=Object.freeze({id,title,description:clean(input.description,600),risk,riskName:RISK_NAMES[risk],readOnly:Boolean(input.readOnly),requiresApproval:risk>=RiskLevel.MEDIUM||Boolean(input.requiresApproval),permissions:Object.freeze([...(input.permissions||[])].slice(0,32).map(x=>clean(x,120)).filter(Boolean)),evidenceRefs:evidence(input.evidenceRefs),state:clean(input.state||'registered_unverified',80)});
    this.capabilities.set(id,item); return clone(item);
  }
  registerApp(input={}){
    const id=clean(input.id,160), title=clean(input.title||id,180);
    if(!id||!title) throw new TypeError('app requires id and title');
    const capabilityIds=[...new Set((input.capabilityIds||[]).map(x=>clean(x,160)).filter(Boolean))];
    for(const cid of capabilityIds) if(!this.capabilities.has(cid)) throw new Error('app references unknown capability');
    const item=Object.freeze({id,title,kind:clean(input.kind||'module',80),entrypoint:clean(input.entrypoint,500)||null,capabilityIds:Object.freeze(capabilityIds),projectScoped:input.projectScoped!==false,sandboxed:input.sandboxed!==false,evidenceRefs:evidence(input.evidenceRefs),state:clean(input.state||'registered_unverified',80)});
    this.apps.set(id,item); return clone(item);
  }
  registerAgent(input={}){
    const id=clean(input.id,160), title=clean(input.title||id,180);
    if(!id||!title) throw new TypeError('agent requires id and title');
    const capabilityIds=[...new Set((input.capabilityIds||[]).map(x=>clean(x,160)).filter(Boolean))];
    for(const cid of capabilityIds) if(!this.capabilities.has(cid)) throw new Error('agent references unknown capability');
    const item=Object.freeze({id,title,provider:clean(input.provider,120)||null,capabilityIds:Object.freeze(capabilityIds),projectScoped:input.projectScoped!==false,evidenceRefs:evidence(input.evidenceRefs),state:clean(input.state||'registered_unverified',80)});
    this.agents.set(id,item); return clone(item);
  }
  planAction({appId=null,capabilityId,projectId=null,objective='',evidenceRefs=[]}={}){
    const capability=this.capabilities.get(capabilityId);
    if(!capability) throw new Error('capability not registered');
    if(appId&&!this.apps.has(appId)) throw new Error('app not registered');
    const refs=evidence(evidenceRefs);
    const plan=Object.freeze({id:makeId('osaction'),appId,capabilityId,projectId:clean(projectId,180)||null,objective:clean(objective,1600),risk:capability.risk,riskName:capability.riskName,requiresApproval:capability.requiresApproval,execute:false,evidenceRefs:refs,createdAt:new Date().toISOString()});
    this.events.push(plan); if(this.events.length>500)this.events.shift(); return clone(plan);
  }
  snapshot(){return {apps:[...this.apps.values()].map(clone),capabilities:[...this.capabilities.values()].map(clone),agents:[...this.agents.values()].map(clone),recentActions:this.events.slice(-50).map(clone)};}
}

export function createPinkOSFoundation(){
  const os=new PinkOSRegistry();
  os.registerCapability({id:'observe',title:'Observe',risk:RiskLevel.READ_ONLY,readOnly:true,evidenceRefs:['pink-v20-contract']});
  os.registerCapability({id:'present',title:'Present',risk:RiskLevel.READ_ONLY,readOnly:true,evidenceRefs:['pink-v20-contract']});
  os.registerCapability({id:'delegate',title:'Delegate to governed agent',risk:RiskLevel.MEDIUM,requiresApproval:true,evidenceRefs:['pink-v20-contract']});
  os.registerCapability({id:'modify',title:'Modify governed resource',risk:RiskLevel.HIGH,requiresApproval:true,evidenceRefs:['pink-v20-contract']});
  os.registerApp({id:'mission-control',title:'Pink Mission Control',capabilityIds:['observe','present'],sandboxed:true,evidenceRefs:['pink-v20-contract']});
  os.registerApp({id:'agent-mesh',title:'Pink Agent Mesh',capabilityIds:['observe','delegate'],sandboxed:true,evidenceRefs:['pink-v20-contract']});
  os.registerApp({id:'evolution-lab',title:'Pink Evolution Lab',capabilityIds:['observe','modify'],sandboxed:true,evidenceRefs:['pink-v20-contract']});
  return os;
}
