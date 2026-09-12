// Pink Panel Router V10 — portfolio-first discovery + active panel context
(() => {
  const REGISTRY_URL = 'https://ricardoprf.github.io/Gest-o-de-Portf-lio-/paineis-publicos.json';
  const PORTFOLIO_URL = 'https://ricardoprf.github.io/Gest-o-de-Portf-lio-/';
  const ACTIVE_KEY = 'pink_active_panel_v2';
  const FALLBACK = [
    {id:'beccs',name:'FS Fueling Sustainability – Projeto BECCS',short:'FS · BECCS',url:'https://ricardoprf.github.io/Painel-de-Bordo-FS-Beccs./',repo:'RICARDOPRF/Painel-de-Bordo-FS-Beccs.',aliases:['beccs','fs beccs','painel beccs','painel do beccs','painel de bordo beccs','painel de bordo do beccs','projeto beccs']},
    {id:'regenerador',name:'ArcelorMittal – Regenerador',short:'ArcelorMittal · Regenerador',url:'https://ricardoprf.github.io/Painel-de-bordo-Regenerador-/',repo:'RICARDOPRF/Painel-de-bordo-Regenerador-',aliases:['regenerador','painel regenerador','painel do regenerador','painel de bordo regenerador','painel de bordo do regenerador','arcelor regenerador']},
    {id:'forno-panela',name:'ArcelorMittal – Forno Panela',short:'ArcelorMittal · Forno Panela',url:'https://ricardoprf.github.io/Painel-de-bordo-Forno-Panela.12/',repo:'RICARDOPRF/Painel-de-bordo-Forno-Panela.12',aliases:['forno panela','forno-panela','painel forno panela','painel do forno panela','painel de bordo forno panela','painel de bordo do forno panela','arcelor forno panela','forno']}
  ];

  let panels = FALLBACK.slice();
  let activePanel = loadActive();
  let queryRunning = false;
  const previousHandle = window.PinkCore?.handleUserSpeech?.bind(window.PinkCore) || null;
  const previousAttach = window.PinkCore?.attachConversation?.bind(window.PinkCore) || null;

  const normalize = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const conversation = () => window.PinkVoice?.getConversation?.() || null;
  const sendContext = text => { try { conversation()?.sendContextualUpdate?.(String(text)); } catch(error) { console.warn('Pink panel context failed', error); } };
  const triggerAgent = instruction => { try { conversation()?.sendUserMessage?.(`[PINK_INTERNAL_RESULT] ${instruction}`); } catch(error) { console.warn('Pink panel trigger failed', error); } };

  function loadActive(){
    try { const value = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null'); return value?.url ? value : null; } catch(_) { return null; }
  }
  function saveActive(panel){
    activePanel = panel ? {...panel} : null;
    try { panel ? sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(panel)) : sessionStorage.removeItem(ACTIVE_KEY); } catch(_) {}
  }
  function todayISO(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function aliasesOf(panel){ return [panel.id,panel.name,panel.short,...(panel.aliases||[])].filter(Boolean); }
  function matchPanel(text=''){
    const n = normalize(text);
    return panels.find(panel => aliasesOf(panel).some(alias => n.includes(normalize(alias)))) || null;
  }
  function isOpenCommand(text=''){
    return /(abre|abrir|abra|entra|entrar|acesse|acessa|ache|encontre|procura|procurar|mostra|mostrar|mostre)/.test(normalize(text));
  }
  function mentionsDashboard(text=''){
    const n = normalize(text);
    return n.includes('painel de bordo') || n.includes('painel do') || n.includes('painel ');
  }
  function isDataQuestion(text=''){
    return /(produtividade|avanco|avancos|previsto|realizado|replan|desvio|hh|curva|indicador|indicadores|semana atual|semana de hoje|como esta|como ta|status|analisa|analisar|analise)/.test(normalize(text));
  }
  function wantsCurrentWeek(text=''){
    return /(semana atual|semana de hoje|esta semana|semana corrente|hoje)/.test(normalize(text));
  }

  async function loadRegistry(){
    try {
      const response = await fetch(`${REGISTRY_URL}?v=${Date.now()}`, {cache:'no-store'});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if(Array.isArray(json?.panels) && json.panels.length) panels = json.panels;
      window.PinkEvolution?.recordSession?.(`panel-registry:${panels.length}`);
    } catch(error) {
      console.warn('Pink panel registry using fallback', error);
      panels = FALLBACK.slice();
    }
  }

  function renderPanel(panel){
    const preview = document.querySelector('#previewArea');
    const address = document.querySelector('#previewAddress');
    if(address) address.textContent = panel.url.replace(/^https?:\/\//,'');
    if(preview){
      preview.innerHTML = `<div class="pink-live-preview" style="width:100%;height:100%;min-height:420px;position:relative;background:#02060c"><iframe data-pink-panel="${panel.id}" title="${panel.name}" src="${panel.url}" style="width:100%;height:100%;min-height:420px;border:0;background:#fff" loading="eager"></iframe><a href="${panel.url}" target="_blank" rel="noopener" style="position:absolute;right:12px;bottom:12px;padding:8px 12px;border-radius:10px;background:rgba(4,11,22,.86);color:white;text-decoration:none;font:600 12px Inter,sans-serif;border:1px solid rgba(255,255,255,.16)">Abrir em nova aba ↗</a></div>`;
    } else window.open(panel.url, '_blank', 'noopener');
  }

  function openPanel(panel){
    saveActive(panel);
    renderPanel(panel);
    window.PinkEvolution?.recordSession?.(`panel-open:${panel.id}`);
    sendContext(`A Pink localizou o painel "${panel.name}" pela Central Gestão de Obras (${PORTFOLIO_URL}). Repositório associado: ${panel.repo || 'não informado'}. Link publicado aberto: ${panel.url}. Este painel agora é o CONTEXTO ATIVO. Responda de forma curta: "Painel ${panel.short || panel.name} aberto. O que você quer consultar ou analisar?" Não antecipe indicadores até o usuário pedir.`);
    return panel;
  }

  async function waitFrame(panel, timeoutMs=15000){
    const started = Date.now();
    while(Date.now()-started < timeoutMs){
      const iframe = document.querySelector(`#previewArea iframe[data-pink-panel="${panel.id}"]`);
      if(iframe){
        try {
          const doc = iframe.contentDocument;
          const win = iframe.contentWindow;
          if(doc && win && doc.readyState === 'complete' && doc.body) return {iframe,doc,win};
        } catch(error) {
          throw new Error('O painel abriu, mas o navegador bloqueou a leitura interna.');
        }
      }
      await sleep(300);
    }
    throw new Error('O painel demorou demais para carregar.');
  }

  const rowCells = row => [...row.querySelectorAll('td')].map(td => String(td.textContent||'').trim());
  const sameWeek = (a,b) => normalize(a).replace(/\s/g,'') === normalize(b).replace(/\s/g,'');

  async function readPanel(panel, request=''){
    const {doc,win} = await waitFrame(panel);
    await sleep(800);
    try { win.abrirPainel?.('geral'); } catch(_) {}
    await sleep(250);

    const date = todayISO();
    let currentWeek = '';
    try { currentWeek = String(win.semanaQuantPorData?.(date) || '').trim(); } catch(_) {}

    try { win.irPara?.('resumo'); } catch(_) {}
    await sleep(350);
    const summary = {
      dataHoje: date,
      semanaPainel: currentWeek || String(doc.querySelector('#selSemanaResumo')?.value || '').trim(),
      previsto: String(doc.getElementById('resPrevAcm')?.textContent || '').trim(),
      replan: String(doc.getElementById('resReplanAcm')?.textContent || '').trim(),
      realizado: String(doc.getElementById('resRealAcm')?.textContent || '').trim(),
      desvioOriginal: String(doc.getElementById('resDesvioAcm')?.textContent || '').trim(),
      desvioReplan: String(doc.getElementById('resDesvioReplan')?.textContent || '').trim()
    };

    try { win.irPara?.('produtividade'); } catch(_) {}
    await sleep(500);
    const rows = [...doc.querySelectorAll('#corpoEstudoProdutividade tr')].map(rowCells).filter(row => row.length >= 6);
    const currentRow = (currentWeek && rows.find(row => sameWeek(row[0], currentWeek))) || rows.at(-1) || [];
    const cards = [...doc.querySelectorAll('#gridResumoProd .mini-card')].map(card => ({
      label:String(card.querySelector('span')?.textContent || '').trim(),
      value:String(card.querySelector('.text-xl')?.textContent || card.lastElementChild?.textContent || '').trim()
    }));
    const card = needle => cards.find(item => normalize(item.label).includes(normalize(needle)))?.value || '';
    const productivity = {
      semanaAtual: currentRow[0] || currentWeek || '',
      produtividadeSemana: currentRow[5] || '',
      produtividadeAcumulada: currentRow[7] || '',
      hhGastoSemana: currentRow[3] || '',
      hhAgregadoSemana: currentRow[4] || '',
      hhGastoTotal: card('HH Gasto Total'),
      hhAgregadoTotal: card('HH Agregado Total'),
      produtividadeGeral: card('Produtividade Geral'),
      horasPerdidas: card('Total Horas Perdidas')
    };
    try { win.irPara?.('resumo'); } catch(_) {}
    return {panel:{id:panel.id,name:panel.name,short:panel.short,url:panel.url,repo:panel.repo},summary,productivity,request};
  }

  function fallbackAnswer(data, request=''){
    const n = normalize(request), s = data.summary || {}, p = data.productivity || {};
    if(n.includes('produtividade') && wantsCurrentWeek(request)){
      return `A produtividade da semana atual${p.semanaAtual?` (${p.semanaAtual})`:''} é ${p.produtividadeSemana || 'não disponível no painel neste momento'}.`;
    }
    if(n.includes('produtividade')){
      const parts=[];
      if(p.produtividadeSemana) parts.push(`produtividade da semana ${p.semanaAtual || ''}: ${p.produtividadeSemana}`);
      if(p.produtividadeAcumulada) parts.push(`acumulada: ${p.produtividadeAcumulada}`);
      if(p.produtividadeGeral) parts.push(`geral: ${p.produtividadeGeral}`);
      return parts.length ? parts.join(', ')+'.' : 'Não encontrei produtividade preenchida no painel.';
    }
    return `${data.panel.short || data.panel.name}: previsto ${s.previsto || '-'}, replan ${s.replan || '-'}, realizado ${s.realizado || '-'}, desvio ${s.desvioReplan || s.desvioOriginal || '-'}.`;
  }

  async function formatAnswer(data, request){
    if(!window.PinkNVIDIA?.ask) return fallbackAnswer(data, request);
    try {
      const result = await window.PinkNVIDIA.ask([
        {role:'system',content:'Você é o analisador da Pink. Use SOMENTE os dados fornecidos. Responda em português do Brasil e de forma curta para voz. Responda exatamente ao indicador pedido. Quando o usuário pedir semana atual, use a semana determinada pela data de hoje no próprio painel. Nunca invente números.'},
        {role:'user',content:`Pedido: ${request}\nDados reais do painel: ${JSON.stringify(data)}`}
      ],{temperature:0.05,maxTokens:300});
      return result.reply || fallbackAnswer(data, request);
    } catch(error) {
      console.warn('Pink panel NVIDIA summary failed', error);
      return fallbackAnswer(data, request);
    }
  }

  async function queryPanel(panel, request){
    if(queryRunning) return;
    queryRunning = true;
    const conv = conversation();
    let hold = null;
    try {
      conv?.sendUserActivity?.();
      hold = setInterval(() => { try { conv?.sendUserActivity?.(); } catch(_) {} }, 1400);
      if(!document.querySelector(`#previewArea iframe[data-pink-panel="${panel.id}"]`)) renderPanel(panel);
      saveActive(panel);
      sendContext(`Consultando agora dados reais do painel ativo ${panel.name}. Aguarde o resultado e não invente valores.`);
      const data = await readPanel(panel, request);
      const answer = await formatAnswer(data, request);
      sendContext(`RESULTADO CONFIRMADO DO PAINEL ${panel.name}: ${answer}\nDados estruturados: ${JSON.stringify(data)}. Use exatamente esses números.`);
      triggerAgent(`Responda agora ao pedido anterior com o resultado confirmado: ${answer}`);
      window.PinkEvolution?.recordSession?.(`panel-query-ok:${panel.id}`);
      return data;
    } catch(error) {
      console.error('Pink panel query failed', error);
      sendContext(`A consulta ao painel ${panel.name} falhou tecnicamente: ${error.message}. Diga isso de forma curta e peça para tentar novamente; não invente números.`);
      triggerAgent(`Informe que não conseguiu ler o painel agora: ${error.message}`);
    } finally {
      if(hold) clearInterval(hold);
      queryRunning = false;
    }
  }

  function handleSpeech(text=''){
    const spoken = String(text).trim();
    if(!spoken) return;
    const explicit = matchPanel(spoken);

    if(explicit && isOpenCommand(spoken) && mentionsDashboard(spoken)){
      openPanel(explicit);
      if(isDataQuestion(spoken)) setTimeout(() => queryPanel(explicit, spoken), 450);
      return;
    }
    if(explicit && isDataQuestion(spoken)){
      if(!activePanel || activePanel.id !== explicit.id) openPanel(explicit);
      setTimeout(() => queryPanel(explicit, spoken), 300);
      return;
    }
    if(activePanel && isDataQuestion(spoken)){
      setTimeout(() => queryPanel(activePanel, spoken), 250);
      return;
    }
    previousHandle?.(spoken);
  }

  function attachConversation(conv){
    previousAttach?.(conv);
    setTimeout(() => sendContext(`Painéis de Bordo disponíveis pela Central Gestão de Obras: ${panels.map(p=>p.short||p.name).join(', ')}. Quando o usuário pedir para abrir um painel, abra e pergunte o que ele quer consultar. O painel aberto permanece como contexto ativo para perguntas seguintes.`), 50);
  }

  if(window.PinkCore){
    window.PinkCore.handleUserSpeech = handleSpeech;
    window.PinkCore.attachConversation = attachConversation;
  }
  window.PinkPanels = {loadRegistry,open:openPanel,query:queryPanel,get active(){return activePanel},get panels(){return panels.slice()}};
  loadRegistry();
})();
