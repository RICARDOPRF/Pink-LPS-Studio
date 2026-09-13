// Pink Phase 4 — bridge legacy PinkCore memory to selective cloud memory.
(() => {
  const RELATIONS=['namorada','namorado','esposa','marido','noiva','noivo','companheira','companheiro','amiga','amigo','irmã','irma','irmão','irmao','mãe','mae','pai','filha','filho','prima','primo','tia','tio','colega','sócia','socia','sócio','socio','chefe','gestor','gestora'];
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const pretty=name=>String(name||'').trim().split(/\s+/).filter(Boolean).map(x=>x.charAt(0).toUpperCase()+x.slice(1).toLowerCase()).join(' ');
  function extractName(text=''){
    const m=String(text).match(/\b(?:eu\s+sou|meu\s+nome\s+(?:é|e)|me\s+chamo)\s+(?:a|o)?\s*([A-Za-zÀ-ÿ'’-]+)(?:\s+([A-Za-zÀ-ÿ'’-]+))?/i);if(!m)return null;
    const stop=new Set(RELATIONS.map(normalize).concat(['do','da','de','e','sou']));const second=m[2]&&!stop.has(normalize(m[2]))?m[2]:'';return pretty([m[1],second].filter(Boolean).join(' '));
  }
  function extractRelationship(text=''){
    const n=normalize(text);return RELATIONS.find(r=>new RegExp(`\\b${normalize(r)}\\b`,'i').test(n))||null;
  }
  function memoryCandidate(text=''){
    const t=String(text).trim(),n=normalize(t);
    if(/\b(lembre|lembra|guarde|anote)\s+(?:que\s+)?/.test(n))return {type:'user_instruction',text:t,importance:.9,explicit:true};
    if(/\b(eu prefiro|minha preferencia|gosto de|nao gosto de)\b/.test(n))return {type:'preference',text:t,importance:.78};
    if(/\b(corrigindo|correcao|na verdade|o correto e)\b/.test(n))return {type:'correction',text:t,importance:.82};
    if(/\b(decidimos|decidi|vamos usar|ficou definido)\b/.test(n))return {type:'decision',text:t,importance:.8};
    return null;
  }
  async function hydrate(){
    const cloud=window.PinkMemoryCloud,core=window.PinkCore;if(!cloud?.people||!core?.people)return;
    try{
      const people=await cloud.people.list();
      for(const p of people||[])core.people.remember?.(p.display_name||p.name,p.relationship||null);
      for(const project of core.projects||[]){
        const saved=await cloud.projects.remember({project_key:project.id,name:project.name,repo:project.repo,url:project.url,metadata:{source:'pink-core'}}).catch(()=>null);
        if(saved?.id)for(const alias of project.aliases||[])await cloud.projects.alias({project_id:saved.id,alias}).catch(()=>{});
      }
    }catch(error){window.PinkEvolution?.recordIssue?.('memory-hydrate',error?.message||error)}
  }
  function install(){
    const core=window.PinkCore;if(!core||core.__memoryBridgeInstalled)return;
    Object.defineProperty(core,'__memoryBridgeInstalled',{value:true});
    const original=core.handleUserSpeech?.bind(core);
    if(original)core.handleUserSpeech=function(text=''){
      const spoken=String(text).trim();
      try{
        const name=extractName(spoken),relationship=extractRelationship(spoken);const pending=sessionStorage.getItem('pink_pending_person_v1')||'';
        if(name)window.PinkMemoryCloud?.people?.remember?.({name,relationship,source:'self-reported'}).catch(()=>{});
        else if(pending&&relationship)window.PinkMemoryCloud?.people?.remember?.({name:pending,relationship,source:'self-reported'}).catch(()=>{});
        const candidate=memoryCandidate(spoken);if(candidate)window.PinkMemoryCloud?.remember?.({...candidate,source:'voice'}).catch(()=>{});
      }catch(_){ }
      return original(spoken);
    };
    window.addEventListener('pinkmemory:ready',hydrate);
    if(window.PinkMemoryCloud)hydrate();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pinkfoundation:ready',install,{once:true});
})();
