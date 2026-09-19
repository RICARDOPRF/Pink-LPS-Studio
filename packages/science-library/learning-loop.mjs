import { pinkScienceLibrary } from './index.mjs';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));

export class PinkScienceLearningLoop {
  constructor({ library=pinkScienceLibrary, fetcher=globalThis.fetch, now=()=>new Date().toISOString() }={}) {
    this.library=library; this.fetcher=fetcher; this.now=now;
    this.ledger=[]; this.mastery=new Map();
  }
  async ingest(sourceId,{maxBytes=250000}={}) {
    const source=this.library.source(sourceId);
    if (!source) throw new Error('science source not registered');
    if (typeof this.fetcher!=='function') throw new Error('fetch unavailable');
    const response=await this.fetcher(source.url,{headers:{accept:'text/html,application/json,text/plain'}});
    if (!response.ok) throw new Error(`source fetch failed: ${response.status}`);
    const raw=await response.text();
    const content=raw.slice(0,clamp(maxBytes,1000,1000000));
    const record={id:`study_${this.ledger.length+1}`,sourceId,url:source.url,authority:source.authority,
      trust:source.trust,kind:source.kind,fetchedAt:this.now(),bytes:content.length,
      evidenceClass:'official-dataset',content};
    this.ledger.push(record); return structuredClone({...record,content:undefined});
  }
  study({hours=4,level='intermediario'}={}) {
    const plan=this.library.studyPlan({hours,level});
    return {...plan,runId:`science_${Date.now()}`,createdAt:this.now(),
      policy:{background:false,requiresSchedulerForPersistentRuns:true,noEvidenceNoClaim:true}};
  }
  recordAssessment({domainId,score,evidenceRefs=[]}={}) {
    const value=clamp(score,0,1);
    if (!this.library.domains().some(d=>d.id===domainId)) throw new Error('unknown science domain');
    if (!Array.isArray(evidenceRefs)||!evidenceRefs.length) throw new Error('assessment requires evidence');
    const result={domainId,score:value,passed:value>=0.8,evidenceRefs:[...evidenceRefs],recordedAt:this.now()};
    this.mastery.set(domainId,result); return structuredClone(result);
  }
  teacher({topic,level='intermediario'}={}) {
    return {mode:'science-teacher',prompt:this.library.teacherPrompt({topic,level}),
      evidenceRequired:true,allowedEvidence:this.library.snapshot().evidenceClasses};
  }
  snapshot(){ return {ledger:this.ledger.map(({content,...x})=>({...x})),mastery:[...this.mastery.values()]}; }
}
