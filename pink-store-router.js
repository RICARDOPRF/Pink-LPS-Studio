// Pink Store Router V10 — Praia & Movimento live sales + safe catalog operations
(() => {
  const STORE = {
    id:'praia-movimento',
    name:'Praia & Movimento',
    repo:'RICARDOPRF/Praia-e-Movimento',
    github:'https://github.com/RICARDOPRF/Praia-e-Movimento',
    url:'https://ricardoprf.github.io/Praia-e-Movimento/',
    admin:'https://ricardoprf.github.io/Praia-e-Movimento/admin-painel.html'
  };
  const ACTIVE_KEY='pink_active_app_v1';
  const PENDING_KEY='pink_pending_store_action_v1';
  const previousHandle=window.PinkCore?.handleUserSpeech?.bind(window.PinkCore)||null;
  const previousAttach=window.PinkCore?.attachConversation?.bind(window.PinkCore)||null;
  let busy=false;

  const normalize=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const conv=()=>window.PinkVoice?.getConversation?.()||null;
  const sendContext=text=>{try{conv()?.sendContextualUpdate?.(String(text))}catch(e){console.warn('Pink store context',e)}};
  const trigger=text=>{try{conv()?.sendUserMessage?.(`[PINK_INTERNAL_RESULT] ${text}`)}catch(e){console.warn('Pink store trigger',e)}};
  const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const slug=value=>normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  function setActive(){try{sessionStorage.setItem(ACTIVE_KEY,JSON.stringify({id:STORE.id,name:STORE.name,url:STORE.url,repo:STORE.repo}))}catch(_){}}
  function isActive(){try{return JSON.parse(sessionStorage.getItem(ACTIVE_KEY)||'null')?.id===STORE.id}catch(_){return false}}
  function storeMention(text=''){const n=normalize(text);return n.includes('praia e movimento')||n.includes('praia & movimento')||n.includes('praia movimento')||n.includes('loja praia')}
  function openCommand(text=''){return /(abre|abrir|abra|entra|entrar|acesse|acessa|mostra|mostrar|mostre)/.test(normalize(text))}
  function salesQuery(text=''){return /(quanto.*vendi|vendi.*hoje|vendas.*hoje|faturamento.*hoje|lucro.*hoje|qual.*lucro|quanto.*lucro|vendeu.*hoje|venda de hoje)/.test(normalize(text))}
  function writeIntent(text=''){return /(preco|preço|valor|tamanho|tamanhos|remove.*loja|tirar.*loja|recoloca|reativa|coloca.*loja)/.test(normalize(text))}
  function confirms(text=''){return /^(sim|confirmo|confirma|pode fazer|pode alterar|pode mudar|pode salvar|faz|manda ver|ok|okay|confirmado)\b/.test(normalize(text))}
  function cancels(text=''){return /^(nao|não|cancela|cancelar|deixa|esquece)\b/.test(normalize(text))}

  function render(url,title,tag='store'){
    const preview=document.querySelector('#previewArea');
    const address=document.querySelector('#previewAddress');
    if(address)address.textContent=url.replace(/^https?:\/\//,'');
    if(preview)preview.innerHTML=`<div class="pink-live-preview" style="width:100%;height:100%;min-height:420px;position:relative;background:#02060c"><iframe data-pink-${tag}="1" title="${title}" src="${url}" style="width:100%;height:100%;min-height:420px;border:0;background:#fff" loading="eager"></iframe><a href="${url}" target="_blank" rel="noopener" style="position:absolute;right:12px;bottom:12px;padding:8px 12px;border-radius:10px;background:rgba(4,11,22,.86);color:#fff;text-decoration:none;font:600 12px Inter,sans-serif;border:1px solid rgba(255,255,255,.16)">Abrir em nova aba ↗</a></div>`;
    else window.open(url,'_blank','noopener');
  }

  function openStore(){
    setActive();render(STORE.url,STORE.name,'store');
    sendContext(`A Pink localizou o projeto ${STORE.repo} e abriu a publicação ${STORE.url}. A Praia & Movimento agora é o contexto ativo. Pergunte de forma curta: "Loja Praia & Movimento aberta. O que você quer consultar ou alterar?"`);
    window.PinkEvolution?.recordSession?.('store-open:praia-movimento');
  }

  async function ensureAdmin({visible=false}={}){
    let frame=document.querySelector('#pinkStoreAdminFrame');
    if(visible){render(STORE.admin,'Praia & Movimento · Admin','store-admin');frame=document.querySelector('#previewArea iframe[data-pink-store-admin="1"]');}
    if(!frame){
      frame=document.createElement('iframe');frame.id='pinkStoreAdminFrame';frame.src=STORE.admin+'?pink=1';frame.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none';document.body.appendChild(frame);
    }
    const started=Date.now();
    while(Date.now()-started<15000){
      try{
        const win=frame.contentWindow,doc=frame.contentDocument;
        if(win&&doc&&doc.readyState==='complete'&&win.pmFirebase?.db)return {frame,win,doc};
      }catch(e){throw new Error('O navegador bloqueou o acesso ao painel administrativo.');}
      await sleep(300);
    }
    throw new Error('O painel administrativo demorou demais para carregar.');
  }

  function saoPauloDay(value){
    if(!value)return '';
    const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).split(',')[0].trim();
    return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
  }
  function todayBR(){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date())}

  async function controlDatabase(win){
    const app=win.firebase?.apps?.find(app=>app.name==='controleLoja');
    if(app)return {db:app.database(),auth:app.auth()};
    const nested=win.document?.querySelector('#controle-integrado')?.contentWindow;
    const nestedApp=nested?.firebase?.apps?.find(app=>app.name==='controleLoja');
    if(nestedApp)return {db:nestedApp.database(),auth:nestedApp.auth()};
    return null;
  }

  async function snapshotList(ref){
    const snap=await ref.once('value');const list=[];snap.forEach(child=>list.push({id:child.key,...(child.val()||{})}));return list;
  }

  function productCostMap(products){
    const map=new Map();
    products.forEach(p=>{
      const cost=Number(p.custoReal??p.custoUnitario??p.custo??0)||0;
      [p.lojaSlug,p.slug,p.nome].filter(Boolean).forEach(key=>map.set(slug(key),cost));
    });
    return map;
  }

  async function readTodaySales(){
    const {win}=await ensureAdmin();
    const storeAuth=win.pmFirebase?.auth;
    if(!storeAuth?.currentUser){
      await ensureAdmin({visible:true});
      throw new Error('Faça login no painel administrador da Praia & Movimento uma vez. Depois a Pink consegue consultar as vendas automaticamente.');
    }
    const today=todayBR();
    const orderSnap=await win.pmFirebase.db.collection('pedidos').get();
    const orders=orderSnap.docs.map(doc=>({id:doc.id,...doc.data()}));
    const paid=orders.filter(order=>{
      const status=normalize(order.status_pagamento||order.status);
      const approved=status==='approved'||status==='pago'||status==='pagamento confirmado'||status==='pagamento_confirmado';
      const when=order.aprovadoEm||order.atualizadoEm||order.criadoEm;
      return approved&&saoPauloDay(when)===today;
    });

    let controlProducts=[],manualSales=[];
    try{
      const control=await controlDatabase(win);
      if(control?.auth?.currentUser){
        [controlProducts,manualSales]=await Promise.all([snapshotList(control.db.ref('produtos')),snapshotList(control.db.ref('vendas'))]);
      }
    }catch(error){console.warn('Pink control data unavailable',error)}

    const costs=productCostMap(controlProducts);
    let onlineGross=0,onlineNet=0,onlineShipping=0,onlineProductCost=0,onlineUnits=0,missingCosts=0;
    paid.forEach(order=>{
      onlineGross+=Number(order.valor_pago??order.valorTotal??order.total??0)||0;
      onlineNet+=Number(order.valor_liquido??order.valor_pago??order.valorTotal??0)||0;
      onlineShipping+=Number(order.frete?.valor??order.valorFrete??0)||0;
      (order.itens||[]).forEach(item=>{
        const qty=Number(item.quantidade??item.quantity??1)||1;onlineUnits+=qty;
        const key=slug(item.id||item.nome||'');
        let unitCost=costs.get(key);
        if(unitCost==null&&item.nome)unitCost=costs.get(slug(item.nome));
        if(unitCost==null){missingCosts+=qty;unitCost=0;}
        onlineProductCost+=unitCost*qty;
      });
    });
    const onlineProfit=onlineNet-onlineShipping-onlineProductCost;

    const manualToday=manualSales.filter(sale=>{
      const raw=String(sale.dataHora||sale.data||'').trim();
      const day=raw.includes('/')?raw.split(',')[0].trim():saoPauloDay(raw);
      return day===today;
    });
    const manualGross=manualToday.reduce((sum,s)=>sum+(Number(s.valorCobrado)||0),0);
    const manualProfit=manualToday.reduce((sum,s)=>sum+(Number(s.lucroLiquido)||0),0);
    const manualUnits=manualToday.reduce((sum,s)=>sum+(Number(s.quantidade)||1),0);

    return {
      data:today,
      online:{pedidos:paid.length,unidades:onlineUnits,faturamento:onlineGross,liquidoMercadoPago:onlineNet,frete:onlineShipping,custoProdutos:onlineProductCost,lucroOperacional:onlineProfit,custosNaoLocalizados:missingCosts},
      vendaRapida:{vendas:manualToday.length,unidades:manualUnits,faturamento:manualGross,lucro:manualProfit},
      total:{vendas:paid.length+manualToday.length,unidades:onlineUnits+manualUnits,faturamento:onlineGross+manualGross,lucro:onlineProfit+manualProfit}
    };
  }

  function salesFallback(data){
    const t=data.total,o=data.online,m=data.vendaRapida;
    let answer=`Hoje você vendeu ${brl(t.faturamento)} na Praia & Movimento, em ${t.vendas} venda${t.vendas===1?'':'s'}, com lucro operacional de ${brl(t.lucro)}.`;
    if(o.pedidos&&m.vendas)answer+=` Online: ${brl(o.faturamento)}; venda rápida: ${brl(m.faturamento)}.`;
    if(o.custosNaoLocalizados)answer+=` Há ${o.custosNaoLocalizados} unidade(s) online sem custo localizado, então o lucro pode estar superestimado.`;
    return answer;
  }

  async function answerSales(request){
    if(busy)return;busy=true;let timer=null;
    try{
      conv()?.sendUserActivity?.();timer=setInterval(()=>{try{conv()?.sendUserActivity?.()}catch(_){}},1400);
      sendContext('A Pink está consultando os pedidos online, Mercado Pago e o Controle da Praia & Movimento. Não invente valores; aguarde o resultado confirmado.');
      const data=await readTodaySales();
      let answer=salesFallback(data);
      if(window.PinkNVIDIA?.ask){
        try{
          const result=await window.PinkNVIDIA.ask([
            {role:'system',content:'Use somente os dados fornecidos. Responda em português do Brasil, curto e natural para voz. Informe faturamento de hoje, número de vendas e lucro. Se custos não foram localizados, avise que o lucro é estimado. Não invente números.'},
            {role:'user',content:`Pedido: ${request}\nDados reais: ${JSON.stringify(data)}`}
          ],{temperature:0.05,maxTokens:280});
          if(result.reply)answer=result.reply;
        }catch(e){console.warn('Pink store NVIDIA summary',e)}
      }
      sendContext(`RESULTADO CONFIRMADO PRAIA & MOVIMENTO: ${answer}\nDados: ${JSON.stringify(data)}`);
      trigger(`Responda agora ao pedido anterior usando este resultado confirmado: ${answer}`);
      window.PinkEvolution?.recordSession?.('store-sales-today-ok');
      return data;
    }catch(error){
      sendContext(`Falha ao consultar a Praia & Movimento: ${error.message}`);trigger(error.message);
    }finally{if(timer)clearInterval(timer);busy=false;}
  }

  function savePending(action){try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(action))}catch(_){}}
  function loadPending(){try{return JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null')}catch(_){return null}}
  function clearPending(){try{sessionStorage.removeItem(PENDING_KEY)}catch(_){}}

  function bestProductRow(doc,speech){
    const n=normalize(speech);let best=null,bestScore=0;
    [...doc.querySelectorAll('#produtos-tbody tr')].forEach(row=>{
      const name=String(row.querySelector('td:nth-child(2) .font-bold')?.textContent||'').trim();if(!name)return;
      const nn=normalize(name);let score=n.includes(nn)?1000+nn.length:0;
      if(!score){const tokens=nn.split(/\s+/).filter(x=>x.length>2);score=tokens.reduce((s,t)=>s+(n.includes(t)?t.length:0),0);}
      if(score>bestScore){bestScore=score;best={row,name};}
    });
    return bestScore>=4?best:null;
  }

  async function prepareWrite(spoken){
    const {doc}=await ensureAdmin({visible:true});
    const storeAuth=doc.defaultView?.pmFirebase?.auth;
    if(!storeAuth?.currentUser)throw new Error('Entre no painel administrador para a Pink poder alterar produtos.');
    const productsTab=doc.querySelector('[data-tab="produtos"]');productsTab?.click();await sleep(450);
    const product=bestProductRow(doc,spoken);if(!product)throw new Error('Não encontrei com segurança qual produto você quer alterar. Fale o nome completo do produto.');
    const n=normalize(spoken);let action=null;
    if(/remove.*da loja|tirar.*da loja/.test(n))action={type:'active',value:false};
    else if(/recoloca|reativa|coloca.*na loja/.test(n))action={type:'active',value:true};
    else if(n.includes('preco')||n.includes('valor')){
      const match=n.match(/(?:preco|valor).*?(?:para|por|em)\s*(?:r\$\s*)?([0-9.]+(?:,[0-9]{1,2})?)/);
      if(!match)throw new Error('Entendi que quer mudar o preço, mas não entendi o novo valor.');
      action={type:'price',value:Number(match[1].replace(/\./g,'').replace(',','.'))};
    }else if(n.includes('tamanho')){
      const tail=n.split(/\b(?:para|em)\b/).pop()||'';
      const sizes=(tail.match(/\b(?:pp|p|m|g|gg|xg|xgg|u|unico)\b/g)||[]).map(x=>x==='unico'?'U':x.toUpperCase());
      if(!sizes.length)throw new Error('Entendi que quer mudar os tamanhos, mas não identifiquei os tamanhos novos.');
      action={type:'sizes',value:[...new Set(sizes)]};
    }
    if(!action)throw new Error('Ainda não reconheci essa alteração de produto.');
    const pending={...action,productName:product.name,createdAt:Date.now()};savePending(pending);
    const description=action.type==='price'?`preço de ${product.name} para ${brl(action.value)}`:action.type==='sizes'?`tamanhos de ${product.name} para ${action.value.join(', ')}`:`${action.value?'recolocar':'remover'} ${product.name} ${action.value?'na':'da'} loja`;
    sendContext(`A Pink preparou uma alteração REAL na Praia & Movimento: ${description}. Não execute ainda. Pergunte: "Confirma que eu posso ${description}?"`);
    trigger(`Peça confirmação para esta alteração real: ${description}.`);
  }

  async function executePending(){
    const pending=loadPending();if(!pending)return false;
    if(Date.now()-Number(pending.createdAt||0)>10*60*1000){clearPending();throw new Error('A confirmação expirou. Peça a alteração novamente.');}
    const {doc}=await ensureAdmin({visible:true});
    doc.querySelector('[data-tab="produtos"]')?.click();await sleep(350);
    const product=bestProductRow(doc,pending.productName);if(!product)throw new Error('O produto não está mais disponível na lista.');
    product.row.querySelector('[data-action="edit"]')?.click();await sleep(250);
    const form=doc.querySelector('#form-produto');if(!form)throw new Error('Não consegui abrir a edição do produto.');
    if(pending.type==='price')doc.querySelector('#p-preco').value=String(pending.value);
    if(pending.type==='sizes'){doc.querySelector('#p-tamanhos').value=pending.value.join(', ');const exhausted=doc.querySelector('#p-esgotados');if(exhausted){const allowed=new Set(pending.value);exhausted.value=String(exhausted.value||'').split(',').map(x=>x.trim().toUpperCase()).filter(x=>allowed.has(x)).join(', ');}}
    if(pending.type==='active')doc.querySelector('#p-ativo').checked=Boolean(pending.value);
    form.requestSubmit();
    await sleep(1800);clearPending();
    const done=pending.type==='price'?`Preço de ${pending.productName} alterado para ${brl(pending.value)}.`:pending.type==='sizes'?`Tamanhos de ${pending.productName} alterados para ${pending.value.join(', ')}.`:`${pending.productName} ${pending.value?'recolocado na loja':'removido da loja'}.`;
    sendContext(`ALTERAÇÃO CONFIRMADA E ENVIADA AO ADMIN DA PRAIA & MOVIMENTO: ${done}`);trigger(done);window.PinkEvolution?.recordSession?.('store-write-ok');return true;
  }

  function handleSpeech(text=''){
    const spoken=String(text).trim();if(!spoken)return;
    const pending=loadPending();
    if(pending&&confirms(spoken)){executePending().catch(e=>{clearPending();sendContext(`Falha ao alterar a loja: ${e.message}`);trigger(e.message)});return;}
    if(pending&&cancels(spoken)){clearPending();sendContext('A alteração pendente da Praia & Movimento foi cancelada.');return;}
    if(storeMention(spoken)&&openCommand(spoken)&&!salesQuery(spoken)&&!writeIntent(spoken)){openStore();return;}
    if((storeMention(spoken)||isActive())&&salesQuery(spoken)){setActive();answerSales(spoken);return;}
    if((storeMention(spoken)||isActive())&&writeIntent(spoken)){setActive();prepareWrite(spoken).catch(e=>{sendContext(`Não consegui preparar a alteração: ${e.message}`);trigger(e.message)});return;}
    previousHandle?.(spoken);
  }

  function attachConversation(conversation){
    previousAttach?.(conversation);
    setTimeout(()=>sendContext(`Você também opera a Praia & Movimento. Projeto GitHub: ${STORE.repo}; publicação: ${STORE.url}. Pode consultar vendas e lucro do dia usando dados reais e preparar alterações de preço, tamanhos e status do produto. Toda alteração real exige confirmação explícita antes de salvar.`),80);
  }

  if(window.PinkCore){window.PinkCore.handleUserSpeech=handleSpeech;window.PinkCore.attachConversation=attachConversation;}
  window.PinkStore={store:STORE,open:openStore,salesToday:readTodaySales,prepareWrite,get pending(){return loadPending()}};
})();
