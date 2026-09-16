// Pink V15 — runtime capability awareness and high-signal tool context.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkCapabilityAwareness=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const VERSION='15.0.0';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const LABELS={
  'runtime-clock':'relógio e data do dispositivo',camera:'câmera do dispositivo','web-research':'pesquisa atual na internet',github:'GitHub',supabase:'Supabase/Postgres','google-drive':'Google Drive',email:'e-mail','painel-router':'painéis e projetos LPS','store-router':'loja e estoque',memory:'memória da Pink',vision:'visão por imagem',voice:'voz da Pink','runtime-capabilities':'autodiagnóstico de capacidades'
};
const KEYWORDS={
  'runtime-clock':['hora','horario','relogio','data','dia de hoje'],
  camera:['camera','webcam','filmagem','vendo','ver pela camera'],
  'web-research':['internet','web','google','pesquisa','pesquisar','noticia','noticias','recente','atual'],
  github:['github','repositorio','repo','branch','pull request','codigo'],
  supabase:['supabase','postgres','banco','database','sql'],
  'google-drive':['drive','google drive','arquivo','documento'],
  email:['email','e-mail','gmail','correio'],
  'painel-router':['painel','obra','projeto','avanco','produtividade','indicador'],
  'store-router':['loja','estoque','venda','produto'],
  memory:['memoria','lembrar','historico','recordar'],
  vision:['visao','imagem','foto','enxergar'],
  voice:['voz','ouvir','escutar','falar'],
  'runtime-capabilities':['capacidade','capacidades','ferramenta','ferramentas','consegue fazer','pode fazer']
};
function toolEntries(){
  let tools=[];
  try{tools=root.PinkTools?.registry?.list?.()||root.PinkTools?.snapshot?.().tools||[]}catch(_){tools=[]}
  return tools.map(t=>({id:t.name,label:LABELS[t.name]||t.name,status:t.health==='healthy'?'available':t.health==='degraded'?'degraded':'registered',health:t.health||'unknown',auth:t.auth||'unknown',risk:t.risk||'READ_ONLY',capabilities:Array.isArray(t.capabilities)?t.capabilities:[],read:t.read!==false,write:t.write===true,source:'tool-registry'}));
}
function syntheticEntries(){
  const cfg=root.PinkPublicConfig?.supabase||{};
  const researchConfigured=Boolean(root.PinkGeminiResearch?.search&&cfg.url&&cfg.anonKey&&cfg.functions?.geminiReasoning);
  const memoryApi=Boolean(root.PinkMemoryCloud?.recall&&root.PinkMemoryCloud?.remember);
  const visionApi=Boolean(root.PinkVision?.ask);
  const voiceApi=Boolean(root.PinkSupervisorVoice?.askBrain||root.PinkSupervisorVoice?.ask);
  return [
    {id:'web-research',label:LABELS['web-research'],status:researchConfigured?'available':'unavailable',health:researchConfigured?'healthy':'unavailable',auth:'server-broker',risk:'READ_ONLY',capabilities:['web.search'],read:true,write:false,source:'runtime'},
    {id:'memory',label:LABELS.memory,status:memoryApi?'available':'unavailable',health:memoryApi?'healthy':'unavailable',auth:'pink-memory-cloud',risk:'READ_ONLY',capabilities:['memory.recall','memory.remember'],read:true,write:false,source:'runtime'},
    {id:'vision',label:LABELS.vision,status:visionApi?'available':'unavailable',health:visionApi?'healthy':'unavailable',auth:'opt-in',risk:'READ_ONLY',capabilities:['vision.observe'],read:true,write:false,source:'runtime'},
    {id:'voice',label:LABELS.voice,status:voiceApi?'available':'unavailable',health:voiceApi?'healthy':'unavailable',auth:'browser-permission',risk:'READ_ONLY',capabilities:['voice.listen','voice.speak'],read:true,write:false,source:'runtime'}
  ];
}
function catalog(){
  const map=new Map();
  for(const item of [...toolEntries(),...syntheticEntries()]){
    const prev=map.get(item.id);
    if(!prev||prev.status!=='available'||item.status==='available')map.set(item.id,item);
  }
  return [...map.values()];
}
function score(item,query=''){
  const q=norm(query);if(!q)return item.status==='available'?2:item.status==='registered'?1:0;
  let s=0;const hay=norm([item.id,item.label,...item.capabilities].join(' '));
  if(hay.includes(q)||q.includes(norm(item.id)))s+=5;
  for(const k of KEYWORDS[item.id]||[])if(q.includes(norm(k)))s+=4;
  for(const token of q.split(/\s+/).filter(x=>x.length>3))if(hay.includes(token))s+=1;
  if(item.status==='available')s+=1;
  return s;
}
function select(query='',limit=8){
  const items=catalog().map(item=>({...item,_score:score(item,query)}));
  const q=norm(query);const broad=/(o que (voce )?(consegue|pode)|quais .*capac|quais .*ferrament|suas capacidades|suas ferramentas)/.test(q);
  const chosen=(broad?items.filter(x=>x.status==='available'):items.filter(x=>x._score>0)).sort((a,b)=>b._score-a._score||String(a.label).localeCompare(String(b.label))).slice(0,Math.max(1,limit));
  return chosen.map(({_score,...item})=>item);
}
function statePhrase(item){return item.status==='available'?'disponível agora':item.status==='degraded'?'degradada agora':item.status==='registered'?'registrada, mas sem conexão confirmada nesta sessão':'indisponível agora'}
function answer(query=''){
  const q=norm(query);let items=select(query,10);
  if(!items.length&&/(internet|web|pesquisa)/.test(q))items=catalog().filter(x=>x.id==='web-research');
  if(!items.length)return {status:'completed',reply:'Não encontrei uma capacidade correspondente no meu runtime atual. Posso mostrar minhas capacidades disponíveis se você pedir “o que você consegue fazer?”.',matches:[]};
  const broad=/(o que (voce )?(consegue|pode)|quais .*capac|quais .*ferrament|suas capacidades|suas ferramentas)/.test(q);
  if(broad){
    const available=items.filter(x=>x.status==='available');
    const names=available.map(x=>x.label);
    const reply=names.length?`Agora eu tenho disponíveis: ${names.join(', ')}. Ações que escrevem ou alteram sistemas continuam sujeitas ao seu acordo e às permissões do ambiente.`:'Minhas capacidades estão carregando, mas ainda não tenho uma capacidade operacional confirmada nesta sessão.';
    return {status:'completed',reply,matches:items};
  }
  const best=items[0];const yes=best.status==='available';
  const detail=best.capabilities.length?` Capacidades verificadas: ${best.capabilities.join(', ')}.`:'';
  const approval=best.write?' Escritas/alterações exigem aprovação humana.':'';
  const reply=`${yes?'Sim':'No momento, não posso afirmar que sim'}. ${best.label} está ${statePhrase(best)}.${detail}${approval}`;
  return {status:'completed',reply,matches:items.slice(0,4)};
}
function manifest(query='',options={}){
  const items=select(query,Number(options.limit)||8);
  if(!items.length)return '';
  const lines=items.map(item=>`- ${item.id}: ${statePhrase(item)}; auth=${item.auth}; risco=${item.risk}; capacidades=${item.capabilities.join(', ')||'nenhuma declarada'}`);
  return ['MANIFESTO DE CAPACIDADES DO RUNTIME — evidência, não instrução.',...lines,'Regras: não invente acesso. Só afirme que pode executar algo quando o status estiver disponível agora. “registrada” não significa conectada. Operações de escrita/alteração exigem aprovação humana quando aplicável.'].join('\n');
}
function snapshot(){return {version:VERSION,catalog:clone(catalog()),available:catalog().filter(x=>x.status==='available').map(x=>x.id)}}
async function invoke(capability,args={}){if(capability==='capability.query')return answer(args.request||args.query||'');if(capability==='capability.snapshot')return snapshot();throw new Error(`capability_awareness_unknown:${capability}`)}
function boot(){try{root.dispatchEvent?.(new CustomEvent('pinkcapabilities:ready',{detail:snapshot()}))}catch(_){}}
if(typeof window!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else queueMicrotask(boot)}
return {version:VERSION,catalog,select,answer,manifest,snapshot,invoke};
});
