const core=window.PinkMemoryCore;
if(!core) throw new Error('PinkMemoryCore missing');

class EdgeMemoryAdapter{
  constructor({url,anonKey}){this.url=String(url||'').replace(/\/$/,'');this.anonKey=anonKey;this.lastError=null;this.tenantId=null}
  async call(op,payload={}){
    const response=await fetch(`${this.url}/functions/v1/pink-memory`,{method:'POST',headers:{'Content-Type':'application/json',apikey:this.anonKey,Authorization:`Bearer ${this.anonKey}`},body:JSON.stringify({op,...payload})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok){const error=new Error(data?.detail||data?.error||`pink_memory_http_${response.status}`);this.lastError=error.message;throw error}
    this.lastError=null;return data.result;
  }
  async init(){const result=await this.call('health');this.tenantId=result?.tenantId||null;return result}
  async upsertMemory(record){return this.call('remember',{type:record.memory_type,text:record.content_text,data:record.content_json,importance:record.importance,fingerprint:record.fingerprint,source:record.source,projectId:record.project_id||null,personId:record.person_id||null})}
  async listMemories(){return this.call('recall',{query:'',limit:200})}
  async upsertPerson(person){return this.call('person_remember',{name:person.display_name||person.name,source:person.source||'self-reported',metadata:person.metadata||{}})}
  async upsertRelationship(rel){return this.call('person_remember',{name:rel.subject_name,relationship:rel.relationship_type,target_label:'Ricardo',source:rel.source||'self-reported',confidence:rel.confidence??1})}
  async listPeople(){return this.call('people_list')}
  async findPerson(name){return this.call('person_find',{name})}
  async upsertProject(project){return this.call('project_remember',{project_key:project.project_key||project.id,name:project.name,repo:project.repo||null,deployment_url:project.deployment_url||project.url||null,metadata:project.metadata||{}})}
  async upsertAlias(alias){return this.call('alias_remember',{project_id:alias.project_id||null,project_key:alias.project_key||null,alias:alias.alias})}
  async resolveAlias(alias){return this.call('alias_resolve',{alias})}
  health(){return {ok:!this.lastError,mode:'cloud-edge',tenantId:this.tenantId,lastError:this.lastError}}
}

function attachApi(api){
  api.remember=input=>api.service.remember(input);
  api.recall=(query,opts)=>api.service.recall(query,opts);
  api.people={remember:p=>api.service.rememberPerson({...p,target_label:p?.target_label||'Ricardo'}),list:()=>api.service.listPeople(),find:n=>api.service.findPerson(n)};
  api.projects={remember:p=>api.service.rememberProject(p),alias:a=>api.service.rememberAlias(a),resolve:a=>api.service.resolveAlias(a)};
}
async function waitForConfig(timeoutMs=2500){const started=Date.now();while(!window.PinkPublicConfig&&Date.now()-started<timeoutMs)await new Promise(r=>setTimeout(r,40));return window.PinkPublicConfig||null}

async function bootstrap(){
  const publicConfig=await waitForConfig();
  const cfg=publicConfig?.supabase;
  const enabled=publicConfig?.features?.cloudMemory===true;
  const fallback=new core.LocalMemoryAdapter({storage:window.localStorage});
  const api={version:'5.0.0',status:'booting',service:new core.MemoryService({fallback}),health:()=>api.service.health()};
  attachApi(api);window.PinkMemoryCloud=api;
  if(!enabled||!cfg?.url||!cfg?.anonKey){api.status='local-fallback';window.PinkOperatingCore?.health?.recordExternal?.('memory-cloud',api.health());window.dispatchEvent(new CustomEvent('pinkmemory:ready',{detail:{status:api.status,...api.health()}}));return api}
  try{
    const primary=new EdgeMemoryAdapter({url:cfg.url,anonKey:cfg.anonKey});
    await primary.init();
    api.service=new core.MemoryService({primary,fallback});api.status='cloud';api.primary=primary;api.tenantId=primary.tenantId;attachApi(api);
    const legacy=core.migrateLegacyPeople(window.localStorage);for(const person of legacy)await api.service.rememberPerson({...person,target_label:'Ricardo'}).catch(()=>{});
    await api.service.remember({type:'identity',text:'O administrador principal da Pink se chama Ricardo e prefere ser chamado de Ricardo.',importance:1,explicit:true,source:'pink-bootstrap'}).catch(()=>{});
  }catch(error){api.status='local-fallback';api.error=String(error?.message||error);api.service.lastError=api.error;window.PinkEvolution?.recordIssue?.('memory-cloud-bootstrap',api.error)}
  window.PinkOperatingCore?.health?.recordExternal?.('memory-cloud',api.health());
  window.dispatchEvent(new CustomEvent('pinkmemory:ready',{detail:{status:api.status,...api.health()}}));
  return api;
}

bootstrap();
