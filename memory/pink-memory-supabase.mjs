import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const core=window.PinkMemoryCore;
if(!core) throw new Error('PinkMemoryCore missing');

class SupabaseMemoryAdapter{
  constructor({client,tenantId,userId}){this.client=client;this.tenantId=tenantId;this.userId=userId;this.lastError=null}
  row(base={}){return {tenant_id:this.tenantId,...base}}
  async upsertMemory(record){const payload=this.row({...record,user_id:record.user_id||this.userId});if(!record.person_id)delete payload.person_id;if(!record.project_id)delete payload.project_id;const {data,error}=await this.client.from('pink_memories').upsert(payload,{onConflict:'tenant_id,fingerprint'}).select().single();if(error)throw error;return data}
  async listMemories(){const {data,error}=await this.client.from('pink_memories').select('*').eq('tenant_id',this.tenantId).order('updated_at',{ascending:false}).limit(200);if(error)throw error;return data||[]}
  async upsertPerson(person){const payload=this.row({normalized_name:core.normalize(person.normalized_name||person.display_name),display_name:person.display_name,source:person.source||'self-reported',first_seen_at:person.first_seen_at||new Date().toISOString(),last_seen_at:person.last_seen_at||new Date().toISOString(),metadata:person.metadata||{}});const {data,error}=await this.client.from('pink_people').upsert(payload,{onConflict:'tenant_id,normalized_name'}).select().single();if(error)throw error;return data}
  async upsertRelationship(rel){let subjectId=rel.subject_person_id;if(!subjectId&&rel.subject_name){const person=await this.findPerson(rel.subject_name);subjectId=person?.id}if(!subjectId)throw new Error('relationship_subject_missing');const payload=this.row({subject_person_id:subjectId,target_user_id:rel.target_user_id||this.userId,target_label:rel.target_label||'Paulo',relationship_type:rel.relationship_type,source:rel.source||'self-reported',confidence:rel.confidence??1});const {data,error}=await this.client.from('pink_relationships').upsert(payload,{onConflict:'tenant_id,subject_person_id,target_label'}).select().single();if(error)throw error;return data}
  async listPeople(){const {data:people,error}=await this.client.from('pink_people').select('*').eq('tenant_id',this.tenantId).order('last_seen_at',{ascending:false});if(error)throw error;const {data:rels,error:relError}=await this.client.from('pink_relationships').select('*').eq('tenant_id',this.tenantId);if(relError)throw relError;return (people||[]).map(p=>({...p,relationship:(rels||[]).find(r=>r.subject_person_id===p.id)?.relationship_type||null}))}
  async findPerson(name){const {data,error}=await this.client.from('pink_people').select('*').eq('tenant_id',this.tenantId).eq('normalized_name',core.normalize(name)).maybeSingle();if(error)throw error;if(!data)return null;const {data:rel}=await this.client.from('pink_relationships').select('relationship_type').eq('tenant_id',this.tenantId).eq('subject_person_id',data.id).maybeSingle();return {...data,relationship:rel?.relationship_type||null}}
  async upsertProject(project){const payload=this.row({project_key:core.normalize(project.project_key||project.id||project.name).replace(/\s+/g,'-'),name:project.name,repo:project.repo||null,deployment_url:project.deployment_url||project.url||null,metadata:project.metadata||{}});const {data,error}=await this.client.from('pink_projects').upsert(payload,{onConflict:'tenant_id,project_key'}).select().single();if(error)throw error;return data}
  async upsertAlias(alias){let projectId=alias.project_id;if(!projectId&&alias.project_key){const {data}=await this.client.from('pink_projects').select('id').eq('tenant_id',this.tenantId).eq('project_key',alias.project_key).maybeSingle();projectId=data?.id}if(!projectId)throw new Error('alias_project_missing');const payload=this.row({project_id:projectId,alias:alias.alias,normalized_alias:core.normalize(alias.normalized_alias||alias.alias)});const {data,error}=await this.client.from('pink_project_aliases').upsert(payload,{onConflict:'tenant_id,normalized_alias'}).select().single();if(error)throw error;return data}
  async resolveAlias(alias){const {data,error}=await this.client.from('pink_project_aliases').select('*,pink_projects(*)').eq('tenant_id',this.tenantId).eq('normalized_alias',core.normalize(alias)).maybeSingle();if(error)throw error;return data}
  health(){return {ok:true,mode:'cloud',tenantId:this.tenantId,userId:this.userId,lastError:this.lastError}}
}

function attachApi(api){
  api.remember=input=>api.service.remember(input);
  api.recall=(query,opts)=>api.service.recall(query,opts);
  api.people={remember:p=>api.service.rememberPerson(p),list:()=>api.service.listPeople(),find:n=>api.service.findPerson(n)};
  api.projects={remember:p=>api.service.rememberProject(p),alias:a=>api.service.rememberAlias(a),resolve:a=>api.service.resolveAlias(a)};
}
async function waitForConfig(timeoutMs=2500){
  const started=Date.now();
  while(!window.PinkPublicConfig&&Date.now()-started<timeoutMs)await new Promise(r=>setTimeout(r,40));
  return window.PinkPublicConfig||null;
}

async function bootstrap(){
  const publicConfig=await waitForConfig();
  const cfg=publicConfig?.supabase;
  const enabled=publicConfig?.features?.cloudMemory!==false;
  const fallback=new core.LocalMemoryAdapter({storage:window.localStorage});
  const api={version:'4.0.0',status:'booting',service:new core.MemoryService({fallback}),health:()=>api.service.health()};
  attachApi(api);window.PinkMemoryCloud=api;
  if(!enabled||!cfg?.url||!cfg?.anonKey){api.status='local-fallback';window.PinkOperatingCore?.health?.recordExternal?.('memory-cloud',api.health());window.dispatchEvent(new CustomEvent('pinkmemory:ready',{detail:{status:api.status,...api.health()}}));return api}
  try{
    const client=createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'pink-memory-auth-v1'}});
    let {data:{session}}=await client.auth.getSession();
    if(!session){const result=await client.auth.signInAnonymously({options:{data:{app:'pink-lps-studio'}}});if(result.error)throw result.error;session=result.data.session}
    if(!session?.user?.id)throw new Error('supabase_memory_session_missing');
    const {data:memberships,error}=await client.from('pink_tenant_memberships').select('tenant_id,role').eq('user_id',session.user.id).limit(1);if(error)throw error;
    const tenantId=memberships?.[0]?.tenant_id;if(!tenantId)throw new Error('supabase_memory_tenant_missing');
    const primary=new SupabaseMemoryAdapter({client,tenantId,userId:session.user.id});
    api.service=new core.MemoryService({primary,fallback});api.status='cloud';api.client=client;api.tenantId=tenantId;api.userId=session.user.id;attachApi(api);
    const legacy=core.migrateLegacyPeople(window.localStorage);for(const person of legacy)await api.service.rememberPerson(person).catch(()=>{});
  }catch(error){api.status='local-fallback';api.error=String(error?.message||error);api.service.lastError=api.error;window.PinkEvolution?.recordIssue?.('memory-cloud-bootstrap',api.error)}
  window.PinkOperatingCore?.health?.recordExternal?.('memory-cloud',api.health());
  window.dispatchEvent(new CustomEvent('pinkmemory:ready',{detail:{status:api.status,...api.health()}}));
  return api;
}

bootstrap();
