import { AgentRole } from '../agents/index.mjs';

export const AgentMeshMessageType=Object.freeze({
  FINDING:'FINDING',PROPOSAL:'PROPOSAL',CHALLENGE:'CHALLENGE',QUESTION:'QUESTION'
});
const TYPES=new Set(Object.values(AgentMeshMessageType));
const clone=v=>structuredClone(v);
const clean=(v,max=900)=>String(v??'').trim().slice(0,max);
const refs=(items=[])=>Object.freeze((Array.isArray(items)?items:[]).slice(0,24).map(x=>typeof x==='string'?Object.freeze({id:clean(x,240)}):Object.freeze({id:clean(x?.id,240),source:clean(x?.source,500),type:clean(x?.type,100),summary:clean(x?.summary,800)})).filter(x=>x.id||x.source));

export class PinkAgentMesh {
  constructor(){
    this.nodes=new Map(Object.values(AgentRole).map(role=>[role,{id:role,label:role.toUpperCase(),state:'idle',lastSeenAt:null,lastTraceId:null}]));
    this.messages=[];this.links=[];this.lastSyncAt=null;
  }
  recordMessage(input={}){
    const type=clean(input.type,40).toUpperCase(),from=clean(input.from,80),to=clean(input.to,80)||null,summary=clean(input.summary,1600),evidenceRefs=refs(input.evidenceRefs);
    if(!TYPES.has(type))throw new TypeError('invalid agent mesh message type');
    if(!this.nodes.has(from))throw new Error('unknown agent mesh sender');
    if(to&&!this.nodes.has(to))throw new Error('unknown agent mesh recipient');
    if(!summary)throw new TypeError('agent mesh message requires summary');
    if(type!==AgentMeshMessageType.QUESTION&&!evidenceRefs.length)throw new Error('evidence required for non-question mesh message');
    const msg=Object.freeze({id:clean(input.id,200)||`meshmsg_${Date.now()}_${this.messages.length+1}`,type,from,to,summary,evidenceRefs,createdAt:input.createdAt?new Date(input.createdAt).toISOString():new Date().toISOString()});
    if(this.messages.some(x=>x.id===msg.id))return clone(this.messages.find(x=>x.id===msg.id));
    this.messages.push(msg);if(this.messages.length>200)this.messages.shift();return clone(msg);
  }
  sync({traces=[],handoffs=null,orchestration=null}={}){
    for(const node of this.nodes.values()){node.state='idle';node.lastTraceId=null;}
    const safeTraces=Array.isArray(traces)?traces:[];
    for(const trace of safeTraces.slice(-40)){
      for(const span of trace?.spans||[]){
        const m=/^agent:(.+)$/.exec(String(span?.name||''));if(!m)continue;
        const role=m[1];const node=this.nodes.get(role);if(!node)continue;
        const status=String(span.status||'').toLowerCase();
        node.state=status==='running'?(role===AgentRole.VERIFIER?'reviewing':'executing'):status==='review'?'reviewing':status==='error'||status==='blocked'?'error':status==='ok'?'success':'idle';
        node.lastTraceId=trace.id||null;node.lastSeenAt=span.endedIso||span.startedIso||trace.startedIso||null;
      }
      for(const ev of trace?.events||[]){
        if(ev?.type!=='agent_message'||!TYPES.has(String(ev.messageType||'').toUpperCase()))continue;
        try{this.recordMessage({id:ev.id,type:ev.messageType,from:ev.from,to:ev.to,summary:ev.summary,evidenceRefs:ev.evidenceRefs,createdAt:ev.at})}catch{}
      }
    }
    const recent=handoffs?.recent||[];this.links=recent.filter(x=>x?.from&&x?.to).slice(-40).map(x=>Object.freeze({from:x.from,to:x.to,accepted:Boolean(x.accepted),createdAt:x.createdAt||null,taskId:x.taskId||null}));
    this.lastSyncAt=new Date().toISOString();
    return this.snapshot();
  }
  snapshot(){
    return {nodes:[...this.nodes.values()].map(clone),links:this.links.map(clone),messages:this.messages.slice(-50).map(clone),messageTypes:[...TYPES],lastSyncAt:this.lastSyncAt};
  }
}
