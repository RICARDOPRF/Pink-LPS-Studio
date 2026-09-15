// Pink Speaker Identity — conversational identity, no biometric inference.
(() => {
  'use strict';
  const ADMIN_NAME='Ricardo';
  const CURRENT_KEY='pink_current_speaker_v2';
  const PENDING_KEY='pink_pending_person_v1';
  const ADMIN_ALIASES=['ricardo','paulo ricardo','paulo ricardo de oliveira freitas'];
  const RELATIONS=['namorada','namorado','esposa','marido','noiva','noivo','companheira','companheiro','amiga','amigo','irmã','irma','irmão','irmao','mãe','mae','pai','filha','filho','prima','primo','tia','tio','colega','sócia','socia','sócio','socio','chefe','gestor','gestora'];
  const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const pretty=name=>String(name||'').trim().split(/\s+/).filter(Boolean).map(x=>x.charAt(0).toUpperCase()+x.slice(1).toLowerCase()).join(' ');

  function readCurrent(){try{return JSON.parse(sessionStorage.getItem(CURRENT_KEY)||'null')}catch(_){return null}}
  function writeCurrent(value){try{value?sessionStorage.setItem(CURRENT_KEY,JSON.stringify(value)):sessionStorage.removeItem(CURRENT_KEY)}catch(_){}return value}
  function pending(){try{return sessionStorage.getItem(PENDING_KEY)||''}catch(_){return ''}}
  function setPending(name){try{name?sessionStorage.setItem(PENDING_KEY,name):sessionStorage.removeItem(PENDING_KEY)}catch(_){} }
  function isAdminName(name=''){const n=normalize(name);return ADMIN_ALIASES.some(alias=>n===normalize(alias)||n.endsWith(' '+normalize(alias))||normalize(alias).endsWith(' '+n))}
  function extractRelationship(text=''){
    const n=normalize(text);
    return RELATIONS.find(r=>new RegExp(`\\b${normalize(r)}\\b`,'i').test(n))||null;
  }
  function extractName(text=''){
    const raw=String(text||'');
    const patterns=[
      /\b(?:eu\s+sou|meu\s+nome\s+(?:é|e)|me\s+chamo|aqui\s+(?:é|e))\s+(?:a|o)?\s*([A-Za-zÀ-ÿ'’-]+)(?:\s+([A-Za-zÀ-ÿ'’-]+))?/i,
      /\b(?:quem\s+fala|quem\s+está\s+falando|quem\s+esta\s+falando|agora\s+quem\s+está\s+falando|agora\s+quem\s+esta\s+falando)\s+(?:é|e)\s+(?:a|o)?\s*([A-Za-zÀ-ÿ'’-]+)(?:\s+([A-Za-zÀ-ÿ'’-]+))?/i,
      /\b(?:agora\s+é|agora\s+e)\s+(?:a|o)?\s*([A-Za-zÀ-ÿ'’-]+)(?:\s+([A-Za-zÀ-ÿ'’-]+))?/i
    ];
    for(const re of patterns){
      const m=raw.match(re);if(!m)continue;
      const stop=new Set(RELATIONS.map(normalize).concat(['do','da','de','e','sou','dele','dela','do ricardo','da ricardo']));
      const second=m[2]&&!stop.has(normalize(m[2]))?m[2]:'';
      return pretty([m[1],second].filter(Boolean).join(' '));
    }
    return null;
  }
  function wantsSpeakerReset(text=''){
    const n=normalize(text);return /\b(trocar pessoa|troca a pessoa|trocar usuario|troca usuario|outra pessoa vai falar|mudar quem esta falando|mudar quem está falando)\b/.test(n);
  }
  function likelyOnlyIdentity(text=''){
    const n=normalize(text);return n.split(/\s+/).length<=8&&!/[?]|\b(qual|quanto|como|abre|abra|mostra|mostre|analisa|altera|muda|quero|preciso)\b/.test(n);
  }
  async function rememberPerson(name,relationship){
    try{
      await window.PinkMemoryCloud?.people?.remember?.({name,relationship:relationship||null,target_label:ADMIN_NAME,source:'self-reported'});
      if(relationship)await window.PinkMemoryCloud?.remember?.({type:'relationship',text:`${name} informou que é ${relationship} do Ricardo.`,importance:.95,explicit:true,source:'speaker-identity'});
      else await window.PinkMemoryCloud?.remember?.({type:'identity',text:`A pessoa ${name} se apresentou à Pink.`,importance:.8,explicit:true,source:'speaker-identity'});
    }catch(error){window.PinkEvolution?.recordIssue?.('speaker-memory',error?.message||error)}
  }
  async function rememberAdmin(){
    try{await window.PinkMemoryCloud?.remember?.({type:'identity',text:'O administrador principal da Pink se chama Ricardo e prefere ser chamado de Ricardo.',importance:1,explicit:true,source:'speaker-identity'})}catch(_){}
  }
  function context(){
    const s=readCurrent();if(!s)return 'Pessoa falando: não identificada. Antes de tratar a fala como sendo do administrador, confirme quem está falando.';
    return s.role==='admin'?`Pessoa falando: Ricardo. Papel: administrador principal da Pink.`:`Pessoa falando: ${s.name}. Relação informada com Ricardo: ${s.relationship||'ainda não informada'}. Esta pessoa não é o administrador.`;
  }
  async function process(text=''){
    const spoken=String(text||'').trim();if(!spoken)return {intercept:false,current:readCurrent(),context:context()};
    if(wantsSpeakerReset(spoken)){
      writeCurrent(null);setPending('');
      return {intercept:true,response:'Certo. Quem está falando comigo agora?',current:null,context:context()};
    }

    const name=extractName(spoken);
    const relationship=extractRelationship(spoken);
    if(name){
      if(isAdminName(name)){
        setPending('');writeCurrent({name:ADMIN_NAME,role:'admin',relationship:'administrador',identifiedBy:'self-report',at:new Date().toISOString()});await rememberAdmin();
        return {intercept:likelyOnlyIdentity(spoken),response:'Certo, Ricardo. Vou tratar esta sessão como a do administrador. O que você quer fazer?',current:readCurrent(),context:context()};
      }
      writeCurrent({name,role:'guest',relationship:relationship||null,identifiedBy:'self-report',at:new Date().toISOString()});
      if(relationship){setPending('');await rememberPerson(name,relationship);return {intercept:likelyOnlyIdentity(spoken),response:`Prazer, ${name}. Vou lembrar que você é ${relationship} do Ricardo. O que você gostaria de fazer?`,current:readCurrent(),context:context()};}
      setPending(name);await rememberPerson(name,null);
      return {intercept:true,response:`Prazer, ${name}. Qual é a sua relação com o Ricardo?`,current:readCurrent(),context:context()};
    }

    const p=pending();
    if(p){
      if(relationship){
        setPending('');writeCurrent({name:p,role:'guest',relationship,identifiedBy:'self-report',at:new Date().toISOString()});await rememberPerson(p,relationship);
        return {intercept:true,response:`Perfeito, ${p}. Vou lembrar que você é ${relationship} do Ricardo. O que você gostaria de fazer?`,current:readCurrent(),context:context()};
      }
      return {intercept:true,response:`${p}, antes de continuar eu preciso saber qual é a sua relação com o Ricardo.`,current:readCurrent(),context:context()};
    }

    const current=readCurrent();
    if(!current)return {intercept:true,response:'Antes de continuar, quem está falando comigo?',current:null,context:context()};
    return {intercept:false,current,context:context()};
  }

  window.PinkSpeakerIdentity={ADMIN_NAME,process,current:readCurrent,context,reset:()=>{writeCurrent(null);setPending('');return true},extractName,extractRelationship};
})();
