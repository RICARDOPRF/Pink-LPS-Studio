// Pink Phase 4 — Memory & People Graph core.
// Selective memory only: curate -> redact -> deduplicate -> persist -> recall.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')root.PinkMemoryCore=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const IMPORTANT_TYPES=new Set(['identity','relationship','preference','decision','correction','project_alias','project_fact','user_instruction']);
  const TRANSIENT_TYPES=new Set(['greeting','smalltalk','ephemeral_metric','voice_state','loading','typing']);
  const STOP=new Set(['a','o','as','os','de','da','do','das','dos','e','em','um','uma','para','por','com','que','the','and','to','of']);
  const TARGET_LABEL='Ricardo';
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number(n)||0));
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const nowIso=()=>new Date().toISOString();

  function normalize(value=''){
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function tokens(value=''){
    return [...new Set(normalize(value).split(/\s+/).filter(x=>x.length>1&&!STOP.has(x)))];
  }
  function fingerprint(value=''){
    const text=normalize(typeof value==='string'?value:JSON.stringify(value));
    let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;
  }
  function redactSecrets(value=''){
    let text=String(value||'');
    text=text.replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,'[REDACTED_PRIVATE_KEY]');
    text=text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [REDACTED]');
    text=text.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16})\b/g,'[REDACTED_SECRET]');
    text=text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,'[REDACTED_JWT]');
    text=text.replace(/\b(password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*([^\s,;]+)/gi,'$1=[REDACTED]');
    return text;
  }
  function containsRedaction(text=''){return /\[REDACTED(?:_[A-Z_]+)?\]/.test(String(text))}

  class MemoryCurator{
    evaluate(input={}){
      const type=String(input.type||'fact').toLowerCase();
      const raw=String(input.text??input.content??'').trim();
      const sanitized=redactSecrets(raw).trim();
      const explicit=Boolean(input.explicit||input.pinned);
      const base=IMPORTANT_TYPES.has(type)?.85:TRANSIENT_TYPES.has(type)?.08:.42;
      const lengthBoost=sanitized.length>=24?.08:0;
      const importance=clamp(input.importance??(base+lengthBoost));
      const reasons=[];
      if(!sanitized)reasons.push('empty');
      if(TRANSIENT_TYPES.has(type)&&!explicit)reasons.push('transient');
      if(sanitized.length<4&&!explicit)reasons.push('too_short');
      if(containsRedaction(sanitized)&&normalize(sanitized).replace(/redacted\w*/g,'').trim().length<4)reasons.push('secret_only');
      const persist=explicit||(!reasons.length&&importance>=.45);
      return {persist,type,text:sanitized,importance,fingerprint:fingerprint(`${type}|${sanitized}`),redacted:sanitized!==raw,reasons};
    }
  }

  function relevanceScore(query,memory,referenceTime=Date.now()){
    const q=tokens(query);const m=tokens(`${memory.content_text||memory.text||''} ${memory.memory_type||memory.type||''}`);
    if(!q.length)return clamp(memory.importance??.5)*.65;
    const overlap=q.filter(token=>m.includes(token)).length/q.length;
    const importance=clamp(memory.importance??.5);
    const stamp=Date.parse(memory.updated_at||memory.created_at||memory.updatedAt||memory.createdAt||0);
    const days=Number.isFinite(stamp)?Math.max(0,(referenceTime-stamp)/86400000):365;
    const recency=Math.exp(-days/90);
    return clamp(overlap*.62+importance*.25+recency*.13);
  }

  class LocalMemoryAdapter{
    constructor({storage=null,key='pink_memory_fallback_v1'}={}){this.storage=storage;this.key=key;this.state={memories:[],people:[],relationships:[],projects:[],aliases:[]};this.load()}
    load(){try{const parsed=JSON.parse(this.storage?.getItem?.(this.key)||'null');if(parsed&&typeof parsed==='object')this.state={...this.state,...parsed}}catch(_){}}
    save(){try{this.storage?.setItem?.(this.key,JSON.stringify(this.state))}catch(_){}}
    async upsertMemory(record){const idx=this.state.memories.findIndex(x=>x.fingerprint===record.fingerprint);const value={...clone(record),updated_at:nowIso(),created_at:idx>=0?this.state.memories[idx].created_at||nowIso():nowIso()};if(idx>=0)this.state.memories[idx]=value;else this.state.memories.push(value);this.state.memories=this.state.memories.slice(-500);this.save();return clone(value)}
    async listMemories(){return clone(this.state.memories)}
    async upsertPerson(person){const key=normalize(person.normalized_name||person.display_name||person.name);let idx=this.state.people.findIndex(x=>normalize(x.normalized_name||x.display_name)===key);const value={...clone(person),normalized_name:key,last_seen_at:person.last_seen_at||nowIso(),first_seen_at:person.first_seen_at||(idx>=0?this.state.people[idx].first_seen_at:nowIso())};if(idx>=0)this.state.people[idx]={...this.state.people[idx],...value};else this.state.people.push(value);this.save();return clone(value)}
    async upsertRelationship(rel){const key=`${normalize(rel.subject_name||rel.subject_person_id||'')}|${normalize(rel.target_label||TARGET_LABEL)}`;const value={...clone(rel),target_label:rel.target_label||TARGET_LABEL,_key:key,updated_at:nowIso()};const idx=this.state.relationships.findIndex(x=>x._key===key);if(idx>=0)this.state.relationships[idx]=value;else this.state.relationships.push(value);this.save();return clone(value)}
    async listPeople(){return clone(this.state.people).map(person=>{const rel=this.state.relationships.find(r=>normalize(r.subject_name||r.subject_person_id||'')===normalize(person.display_name||person.name));return {...person,relationship:rel?.relationship_type||person.relationship||null}})}
    async findPerson(name){const key=normalize(name);const list=await this.listPeople();return list.find(p=>normalize(p.display_name||p.name)===key)||null}
    async upsertProject(project){const key=normalize(project.project_key||project.id||project.name);const idx=this.state.projects.findIndex(x=>normalize(x.project_key||x.id||x.name)===key);const value={...clone(project),project_key:key};if(idx>=0)this.state.projects[idx]={...this.state.projects[idx],...value};else this.state.projects.push(value);this.save();return clone(value)}
    async upsertAlias(alias){const key=normalize(alias.normalized_alias||alias.alias);const idx=this.state.aliases.findIndex(x=>normalize(x.normalized_alias||x.alias)===key);const value={...clone(alias),normalized_alias:key};if(idx>=0)this.state.aliases[idx]=value;else this.state.aliases.push(value);this.save();return clone(value)}
    async resolveAlias(alias){const key=normalize(alias);return clone(this.state.aliases.find(x=>normalize(x.normalized_alias||x.alias)===key)||null)}
    health(){return {ok:true,mode:'local-fallback',counts:{memories:this.state.memories.length,people:this.state.people.length,relationships:this.state.relationships.length}}}
  }

  class MemoryService{
    constructor({primary=null,fallback=null,curator=new MemoryCurator()}={}){this.primary=primary;this.fallback=fallback||new LocalMemoryAdapter();this.curator=curator;this.lastError=null;this.mode=primary?'cloud':'local-fallback'}
    async call(method,args=[],{fallback=true}={}){
      if(this.primary&&typeof this.primary[method]==='function'){
        try{const value=await this.primary[method](...args);this.mode='cloud';this.lastError=null;return value}catch(error){this.lastError=String(error?.message||error);this.mode='local-fallback'}
      }
      if(fallback&&this.fallback&&typeof this.fallback[method]==='function')return this.fallback[method](...args);
      throw new Error(`memory_method_unavailable:${method}`);
    }
    async remember(input={}){const curated=this.curator.evaluate(input);if(!curated.persist)return {status:'skipped',curated};const record={memory_type:curated.type,content_text:curated.text,content_json:clone(input.data||{}),importance:curated.importance,fingerprint:curated.fingerprint,source:input.source||'conversation',project_id:input.projectId||null,person_id:input.personId||null};const value=await this.call('upsertMemory',[record]);if(this.fallback&&this.primary)await this.fallback.upsertMemory(record).catch(()=>{});return {status:'stored',curated,value}}
    async recall(query,{limit=8,minScore=.22}={}){const list=await this.call('listMemories',[]);return list.map(memory=>({...memory,_score:relevanceScore(query,memory)})).filter(x=>x._score>=minScore).sort((a,b)=>b._score-a._score).slice(0,Math.max(1,limit))}
    async rememberPerson(person={}){const display=String(person.display_name||person.name||'').trim();if(!display)throw new Error('person_name_required');const value=await this.call('upsertPerson',[{...clone(person),display_name:display,normalized_name:normalize(display),source:person.source||'self-reported'}]);if(person.relationship){await this.call('upsertRelationship',[{subject_name:display,subject_person_id:value?.id||null,target_label:person.target_label||TARGET_LABEL,relationship_type:person.relationship,source:person.source||'self-reported'}]);}if(this.fallback&&this.primary){await this.fallback.upsertPerson({...person,display_name:display,normalized_name:normalize(display)}).catch(()=>{});if(person.relationship)await this.fallback.upsertRelationship({subject_name:display,target_label:person.target_label||TARGET_LABEL,relationship_type:person.relationship}).catch(()=>{})}return value}
    async listPeople(){return this.call('listPeople',[])}
    async findPerson(name){return this.call('findPerson',[name])}
    async rememberProject(project){return this.call('upsertProject',[project])}
    async rememberAlias(alias){return this.call('upsertAlias',[alias])}
    async resolveAlias(alias){return this.call('resolveAlias',[alias])}
    health(){const primaryHealth=this.primary?.health?.()||null;const fallbackHealth=this.fallback?.health?.()||null;return {ok:Boolean(primaryHealth?.ok||fallbackHealth?.ok),mode:this.mode,lastError:this.lastError,primary:primaryHealth,fallback:fallbackHealth}}
  }

  function migrateLegacyPeople(storage){
    try{
      const legacy=JSON.parse(storage?.getItem?.('pink_people_memory_v1')||'{}');
      return Object.values(legacy||{}).map(item=>({display_name:item.name,relationship:item.relationship||null,target_label:TARGET_LABEL,source:item.source||'self-reported',first_seen_at:item.firstSeenAt,last_seen_at:item.lastSeenAt})).filter(x=>x.display_name);
    }catch(_){return []}
  }

  return Object.freeze({version:'4.1.0',TARGET_LABEL,normalize,tokens,fingerprint,redactSecrets,relevanceScore,MemoryCurator,LocalMemoryAdapter,MemoryService,migrateLegacyPeople});
});
