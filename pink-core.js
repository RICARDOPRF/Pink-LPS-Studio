// Pink Core V9 — LPS registry + people memory + live panel metrics
// Identity memory is based on what a person tells Pink (name/relationship), never on voice biometrics.
(() => {
  const PEOPLE_KEY = 'pink_people_memory_v1';
  const PENDING_KEY = 'pink_pending_person_v1';

  const PROJECTS = [
    { id:'lps', name:'Lean Performance Solutions', url:'https://www.leanperformancesolutions.com.br/', aliases:['lean performance','lean performance solutions','site da lps','site lps','lps'] },
    { id:'calculadora', name:'Calculadora do Planejador', url:'https://calculadora.leanperformancesolutions.com.br/', aliases:['calculadora','calculadora do planejador','app calculadora'] },
    { id:'duoplanning', name:'DuooPlanning', url:'https://ricardoprf.github.io/DuooPlanning/', aliases:['duoplanning','duoo planning','duo planning','curso lps','plataforma de cursos'] },
    { id:'prospect', name:'LPS Prospect', url:'https://leanperformancesolutions.github.io/LPS-Prospect./', aliases:['lps prospect','prospect','prospecção','prospeccao','empresas sem site'] },
    {
      id:'beccs',
      name:'Painel de Bordo FS BECCS',
      url:'https://ricardoprf.github.io/Painel-de-Bordo-FS-Beccs./',
      repo:'RICARDOPRF/Painel-de-Bordo-FS-Beccs.',
      metrics:true,
      aliases:['beccs','fs beccs','painel beccs','painel do beccs','painel de bordo beccs','painel de bordo do beccs','painel fs beccs','painel de bordo fs beccs','projeto beccs','obra beccs','github beccs','repositorio beccs','repositório beccs']
    },
    { id:'pink', name:'Pink LPS Studio', url:'https://ricardoprf.github.io/Pink-LPS-Studio/', aliases:['pink','pink studio','pink lps','central pink'] }
  ];

  const RELATIONS = [
    ['namorada','namorada'],['namorado','namorado'],['esposa','esposa'],['marido','marido'],
    ['noiva','noiva'],['noivo','noivo'],['companheira','companheira'],['companheiro','companheiro'],
    ['amiga','amiga'],['amigo','amigo'],['irmã','irmã'],['irma','irmã'],['irmão','irmão'],['irmao','irmão'],
    ['mãe','mãe'],['mae','mãe'],['pai','pai'],['filha','filha'],['filho','filho'],
    ['prima','prima'],['primo','primo'],['tia','tia'],['tio','tio'],['colega','colega'],
    ['sócia','sócia'],['socia','sócia'],['sócio','sócio'],['socio','sócio'],
    ['chefe','chefe'],['gestor','gestor'],['gestora','gestora']
  ];

  let activeConversation = null;
  let metricQueryRunning = false;

  function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function loadPeople(){try{const parsed=JSON.parse(localStorage.getItem(PEOPLE_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{}}catch(_){return {}}}
  function savePeople(people){try{localStorage.setItem(PEOPLE_KEY,JSON.stringify(people))}catch(_){}}
  function keyForName(name){return normalize(name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
  function prettyName(name=''){return String(name).trim().split(/\s+/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join(' ')}

  function extractName(text=''){
    const match=String(text).trim().match(/\b(?:eu\s+sou|meu\s+nome\s+(?:é|e)|me\s+chamo)\s+(?:a|o)?\s*([A-Za-zÀ-ÿ'’-]+)(?:\s+([A-Za-zÀ-ÿ'’-]+))?/i);
    if(!match)return null;
    const stop=new Set(['namorada','namorado','esposa','marido','noiva','noivo','amiga','amigo','irma','irmã','irmao','irmão','mae','mãe','pai','do','da','de','e','sou']);
    const first=match[1];
    const second=match[2]&&!stop.has(normalize(match[2]))?match[2]:'';
    const name=prettyName([first,second].filter(Boolean).join(' '));
    return name.length>=2?name:null;
  }

  function extractRelationship(text=''){
    const n=normalize(text);
    for(const [needle,canonical] of RELATIONS){
      const k=normalize(needle);
      const re=new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i');
      if(re.test(n))return canonical;
    }
    return null;
  }

  function getPending(){try{return sessionStorage.getItem(PENDING_KEY)||''}catch(_){return ''}}
  function setPending(name=''){try{name?sessionStorage.setItem(PENDING_KEY,name):sessionStorage.removeItem(PENDING_KEY)}catch(_){}}

  function rememberPerson(name,relationship=null){
    const people=loadPeople();const key=keyForName(name);const previous=people[key]||{};const now=new Date().toISOString();
    people[key]={name:prettyName(name),relationship:relationship||previous.relationship||null,firstSeenAt:previous.firstSeenAt||now,lastSeenAt:now,source:'self-reported'};
    savePeople(people);return people[key];
  }
  function findPerson(name){return loadPeople()[keyForName(name)]||null}
  function sendContext(text){try{activeConversation?.sendContextualUpdate?.(String(text))}catch(error){console.warn('Pink contextual update failed',error)}}
  function memorySummary(){const people=Object.values(loadPeople());if(!people.length)return 'Nenhuma pessoa adicional foi registrada ainda.';return people.map(p=>`${p.name}${p.relationship?` — ${p.relationship} do Paulo`:' — relação ainda não informada'}`).join('; ')}

  function matchProject(text=''){
    const n=normalize(text);
    return PROJECTS.find(project=>project.aliases.some(alias=>n.includes(normalize(alias))))||null;
  }

  function findProject(text=''){
    const n=normalize(text);
    if(!/(abre|abrir|abra|mostra|mostrar|mostre|entra|entrar|acesse|acessa|ir para|vai para|va para|procura|procurar|ache|encontre)/.test(n))return null;
    return matchProject(text);
  }

  function wantsMetrics(text=''){
    const n=normalize(text);
    return /(avanco|avancos|produtividade|produtividades|previsto|realizado|replan|desvio|hh|indicador|indicadores|como esta|como ta|status|resultado|resultados)/.test(n);
  }

  function openProject(project){
    const preview=document.querySelector('#previewArea');const address=document.querySelector('#previewAddress');
    if(address)address.textContent=project.url.replace(/^https?:\/\//,'');
    if(preview){
      preview.innerHTML=`<div class="pink-live-preview" style="width:100%;height:100%;min-height:420px;position:relative;background:#02060c"><iframe data-pink-project="${project.id}" title="${project.name}" src="${project.url}" style="width:100%;height:100%;min-height:420px;border:0;background:#fff" allow="microphone; clipboard-read; clipboard-write" loading="eager"></iframe><a href="${project.url}" target="_blank" rel="noopener" style="position:absolute;right:12px;bottom:12px;padding:8px 12px;border-radius:10px;background:rgba(4,11,22,.86);color:white;text-decoration:none;font:600 12px Inter,sans-serif;border:1px solid rgba(255,255,255,.16)">Abrir em nova aba ↗</a></div>`;
    }else window.open(project.url,'_blank','noopener');
    sendContext(`A interface da Pink abriu o sistema "${project.name}" (${project.url}).${project.repo?` Repositório associado: ${project.repo}.`:''}`);
    window.PinkEvolution?.recordSession?.(`open-project:${project.id}`);return project;
  }

  async function waitForProjectFrame(project,timeoutMs=12000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const iframe=document.querySelector(`#previewArea iframe[data-pink-project="${project.id}"]`);
      if(iframe){
        try{
          const doc=iframe.contentDocument;
          const win=iframe.contentWindow;
          if(doc&&win&&doc.readyState==='complete'&&doc.body&&doc.querySelector('#telaResumo'))return {iframe,doc,win};
        }catch(error){
          console.warn('Pink panel same-origin access failed',error);
          throw new Error('Não consegui acessar os dados internos do painel aberto.');
        }
      }
      await sleep(350);
    }
    throw new Error('O painel demorou demais para carregar.');
  }

  function beginAgentHold(){
    try{activeConversation?.sendUserActivity?.()}catch(_){ }
    const timer=setInterval(()=>{try{activeConversation?.sendUserActivity?.()}catch(_){ }},1400);
    return ()=>clearInterval(timer);
  }

  function textOf(doc,id){return String(doc.getElementById(id)?.textContent||'').trim()}

  async function readBeccsMetrics(project){
    const {doc,win}=await waitForProjectFrame(project);
    await sleep(900);
    try{win.irPara?.('resumo')}catch(_){ }
    await sleep(500);

    const week=String(doc.querySelector('#selSemanaResumo')?.value||doc.querySelector('#selSemanaResumo option:checked')?.textContent||'').trim();
    const summary={
      semana:week,
      previsto:textOf(doc,'resPrevAcm'),
      replan:textOf(doc,'resReplanAcm'),
      realizado:textOf(doc,'resRealAcm'),
      desvioOriginal:textOf(doc,'resDesvioAcm'),
      desvioReplan:textOf(doc,'resDesvioReplan')
    };
    const disciplinas=String(doc.getElementById('resumoCurvasDisciplinas')?.innerText||'').trim().slice(0,6000);

    try{win.irPara?.('produtividade')}catch(_){ }
    await sleep(550);

    const cards=[...doc.querySelectorAll('#gridResumoProd .mini-card')].map(card=>({
      label:String(card.querySelector('span')?.textContent||'').trim(),
      value:String(card.querySelector('.text-xl')?.textContent||card.lastElementChild?.textContent||'').trim()
    })).filter(x=>x.label||x.value);
    const cardValue=(needle)=>cards.find(x=>normalize(x.label).includes(normalize(needle)))?.value||'';
    const rows=[...doc.querySelectorAll('#corpoEstudoProdutividade tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>String(td.textContent||'').trim())).filter(r=>r.length>=6);
    const latestRow=rows.at(-1)||[];
    const productivity={
      hhGastoTotal:cardValue('HH Gasto Total'),
      hhAgregadoTotal:cardValue('HH Agregado Total'),
      produtividadeGeral:cardValue('Produtividade Geral'),
      horasPerdidas:cardValue('Total Horas Perdidas'),
      ultimaSemana:latestRow.length?{
        semana:latestRow[0]||'',
        hhGastoAcumulado:latestRow[1]||'',
        hhAgregadoAcumulado:latestRow[2]||'',
        hhGastoSemana:latestRow[3]||'',
        hhAgregadoSemana:latestRow[4]||'',
        produtividadeSemana:latestRow[5]||'',
        horasPerdidasSemana:latestRow[6]||'',
        produtividadeAcumulada:latestRow[7]||''
      }:null
    };

    try{win.irPara?.('resumo')}catch(_){ }
    return {project:project.name,repo:project.repo,summary,productivity,disciplinas};
  }

  function fallbackMetricsAnswer(metrics){
    const s=metrics.summary||{},p=metrics.productivity||{},w=p.ultimaSemana||{};
    const parts=[`No BECCS${s.semana?`, referência ${s.semana}`:''}`];
    if(s.previsto)parts.push(`previsto acumulado ${s.previsto}`);
    if(s.replan)parts.push(`replan ${s.replan}`);
    if(s.realizado)parts.push(`realizado ${s.realizado}`);
    if(s.desvioReplan)parts.push(`desvio contra o replan ${s.desvioReplan}`); else if(s.desvioOriginal)parts.push(`desvio ${s.desvioOriginal}`);
    if(p.produtividadeGeral)parts.push(`produtividade geral ${p.produtividadeGeral}`);
    if(w.produtividadeSemana)parts.push(`na última semana ${w.semana||''}, produtividade ${w.produtividadeSemana}`);
    if(w.produtividadeAcumulada)parts.push(`produtividade acumulada ${w.produtividadeAcumulada}`);
    return parts.join(', ')+'.';
  }

  async function formatMetricsAnswer(metrics,request){
    if(!window.PinkNVIDIA?.ask)return fallbackMetricsAnswer(metrics);
    try{
      const payload=JSON.stringify(metrics);
      const result=await window.PinkNVIDIA.ask([
        {role:'system',content:'Você é o analisador de dados da Pink. Use SOMENTE os dados fornecidos. Responda em português do Brasil, de forma curta e natural para ser falada em voz alta. Informe avanço geral (previsto/replan/real/desvio) e produtividade. Se houver dados por disciplina, cite apenas os mais relevantes. Nunca invente números nem diga que não tem acesso.'},
        {role:'user',content:`Pedido original: ${request}\nDados lidos diretamente do Painel de Bordo FS BECCS: ${payload}`}
      ],{temperature:0.1,maxTokens:420});
      return result.reply||fallbackMetricsAnswer(metrics);
    }catch(error){
      console.warn('Pink NVIDIA metric summary failed',error);
      return fallbackMetricsAnswer(metrics);
    }
  }

  async function queryProjectMetrics(project,request){
    if(metricQueryRunning)return;
    metricQueryRunning=true;
    const releaseHold=beginAgentHold();
    sendContext(`O usuário pediu dados atuais do ${project.name}. A Pink está consultando o painel aberto e deve usar os números reais carregados nele. Aguarde o resultado da consulta; não diga que o painel não foi encontrado.`);
    window.PinkEvolution?.recordSession?.(`metrics-start:${project.id}`);
    try{
      const metrics=project.id==='beccs'?await readBeccsMetrics(project):null;
      if(!metrics)throw new Error('Este painel ainda não possui leitor de métricas configurado.');
      const answer=await formatMetricsAnswer(metrics,request);
      sendContext(`RESULTADO CONFIRMADO DA CONSULTA AO ${project.name}: ${answer}\nDados estruturados: ${JSON.stringify(metrics)}. Responda usando exatamente esses dados, sem alterar números.`);
      window.PinkEvolution?.recordSession?.(`metrics-ok:${project.id}`);
      await sleep(120);
      try{
        activeConversation?.sendUserMessage?.('[PINK_INTERNAL_RESULT] Responda agora ao pedido anterior usando o resultado confirmado que acabou de entrar no contexto. Seja objetiva e fale os números.');
      }catch(error){console.warn('Pink could not trigger spoken metric response',error)}
      return {metrics,answer};
    }catch(error){
      console.error('Pink project metrics error',error);
      window.PinkEvolution?.recordIssue?.(`metrics-error:${project.id}`,error?.message||error);
      sendContext(`A consulta ao ${project.name} falhou tecnicamente: ${error?.message||error}. Explique de forma curta que o painel foi localizado, mas os dados não puderam ser lidos agora.`);
      try{activeConversation?.sendUserMessage?.('[PINK_INTERNAL_RESULT] Informe que o painel foi localizado, mas a leitura dos dados falhou agora. Não invente números.');}catch(_){ }
      return null;
    }finally{
      releaseHold();metricQueryRunning=false;
    }
  }

  function handleIdentity(text=''){
    const name=extractName(text);const statedRelationship=extractRelationship(text);
    if(name){
      const existing=findPerson(name);const person=rememberPerson(name,statedRelationship);
      const n=normalize(person.name);
      if(n==='paulo'||n==='paulo ricardo'){
        setPending('');
        sendContext(`A pessoa desta sessão se apresentou explicitamente como ${person.name}, o usuário principal da Pink. Trate o nome como contexto conversacional, mas NÃO use essa autoapresentação como autenticação ou autorização para operações sensíveis.`);
      }else if(statedRelationship){
        setPending('');
        sendContext(`A pessoa se apresentou explicitamente como ${person.name} e informou que é ${statedRelationship} do Paulo. Isso é memória auto-declarada, não reconhecimento biométrico. Cumprimente-a pelo nome e não revele dados de outras pessoas.`);
      }else if(existing?.relationship){
        setPending('');
        sendContext(`A pessoa se apresentou explicitamente como ${person.name}. Na memória local auto-declarada, ela é ${existing.relationship} do Paulo. Cumprimente-a naturalmente pelo nome. Não diga que reconheceu a voz e não exponha a lista de memória.`);
      }else{
        setPending(person.name);
        sendContext(`Uma nova pessoa se apresentou explicitamente como ${person.name}. Pergunte agora, de forma natural e curta: "Prazer, ${person.name}. O que você é do Paulo?" Não diga que reconheceu a voz.`);
      }
      return person;
    }

    const pending=getPending();
    if(pending){
      const relationship=extractRelationship(text);
      if(relationship){
        const person=rememberPerson(pending,relationship);setPending('');
        sendContext(`${person.name} acabou de informar que é ${person.relationship} do Paulo. Confirme de forma natural que entendeu e guardou essa informação. Não diga que identificou a pessoa pela voz.`);return person;
      }
      if(/(prefiro nao|prefiro não|nao quero dizer|não quero dizer|não quero falar|nao quero falar)/i.test(text)){
        setPending('');sendContext(`${pending} preferiu não informar a relação com Paulo. Respeite isso e siga a conversa sem insistir.`);
      }
    }
    return null;
  }

  function handleUserSpeech(text=''){
    const spoken=String(text).trim();if(!spoken)return;
    if(spoken.startsWith('[PINK_INTERNAL_RESULT]'))return;
    handleIdentity(spoken);

    const matched=matchProject(spoken);
    if(matched?.metrics&&wantsMetrics(spoken)){
      openProject(matched);
      queryProjectMetrics(matched,spoken);
      return;
    }
    const project=findProject(spoken);
    if(project)openProject(project);
  }

  function attachConversation(conversation){
    activeConversation=conversation||null;if(!activeConversation)return;
    sendContext(`Você está na Central Pink da Lean Performance Solutions. Sistemas disponíveis por voz: ${PROJECTS.map(p=>p.name).join(', ')}. O Painel de Bordo FS BECCS está cadastrado e a Pink consegue abrir o painel e consultar ao vivo avanço, previsto, replan, realizado, desvio, HH e produtividade. Se a pessoa disser explicitamente "eu sou [nome]", use esse nome como autoapresentação. Se for uma pessoa nova e não for Paulo, pergunte imediatamente e de forma natural o que ela é do Paulo; quando ela responder, guarde essa relação como memória auto-declarada. Se ela voltar a se apresentar pelo mesmo nome, use a relação já guardada para contextualizar a conversa. Nunca diga que reconheceu alguém pela voz, nunca use nome/relação como autenticação, e nunca revele a lista de pessoas a outro usuário. Memória local atual: ${memorySummary()}`);
  }
  function detachConversation(){activeConversation=null}

  window.PinkCore={
    projects:PROJECTS.map(p=>({...p})),attachConversation,detachConversation,handleUserSpeech,
    openProject:(idOrName)=>{const q=normalize(idOrName);const project=PROJECTS.find(p=>p.id===q||normalize(p.name)===q||p.aliases.some(a=>normalize(a)===q));return project?openProject(project):null},
    queryMetrics:(idOrName,request='Consulte os avanços e a produtividade.')=>{const q=normalize(idOrName);const project=PROJECTS.find(p=>p.id===q||normalize(p.name)===q||p.aliases.some(a=>normalize(a)===q));if(!project)return Promise.resolve(null);openProject(project);return queryProjectMetrics(project,request)},
    people:{list:()=>Object.values(loadPeople()),remember:rememberPerson,clear:()=>{localStorage.removeItem(PEOPLE_KEY);setPending('')}}
  };
})();