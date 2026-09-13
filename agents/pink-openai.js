// Pink OpenAI Supervisor Bridge — browser-safe; OPENAI_API_KEY stays server-side in Supabase.
(() => {
  'use strict';
  let status='idle', lastError=null, lastModel=null;
  const cfg=()=>window.PinkPublicConfig?.supabase||{};
  const endpoint=()=>`${String(cfg().url||'').replace(/\/$/,'')}/functions/v1/${cfg().functions?.openai||'pink-openai'}`;
  const headers=()=>({'Content-Type':'application/json','apikey':cfg().anonKey,'Authorization':`Bearer ${cfg().anonKey}`});

  async function memoryContext(query){
    try{
      const memories=await window.PinkMemoryCloud?.recall?.(query,{limit:8,minScore:.18})||[];
      if(!memories.length)return '';
      return memories.map((m,i)=>`${i+1}. [${m.memory_type||m.type||'memory'}] ${m.content_text||m.text||''}`).filter(Boolean).join('\n');
    }catch(_){return ''}
  }

  async function ask(input,options={}){
    const prompt=String(input??'').trim();if(!prompt)throw new Error('Mensagem vazia para ChatGPT');
    status='thinking';lastError=null;
    const memory=options.useMemory===false?'':await memoryContext(prompt);
    const activeProject=window.PinkOperatingCore?.snapshot?.().awareness?.activeProject||window.PinkCore?.activeProject||null;
    const context=[activeProject?`Projeto ativo: ${activeProject}`:'',memory?`Memórias relevantes da Pink:\n${memory}`:''].filter(Boolean).join('\n\n');
    const fullInput=context?`${context}\n\nPergunta atual do usuário:\n${prompt}`:prompt;
    const response=await fetch(endpoint(),{method:'POST',headers:headers(),body:JSON.stringify({input:fullInput,reasoningEffort:options.reasoningEffort||'medium',maxOutputTokens:options.maxOutputTokens||1800})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.ok){const detail=payload?.providerMessage||payload?.detail||payload?.error||`HTTP ${response.status}`;lastError=String(detail);status=payload?.error==='openai_not_configured'?'not_configured':'error';throw new Error(lastError)}
    lastModel=payload.model||null;status='online';
    try{window.PinkMemoryCloud?.remember?.({type:'conversation',text:`Pergunta: ${prompt}\nResposta: ${payload.reply}`,importance:.35,source:'chatgpt-supervisor'}).catch(()=>{})}catch(_){ }
    return {reply:String(payload.reply||'').trim(),model:lastModel,usage:payload.usage||null,responseId:payload.responseId||null};
  }

  async function test(){const result=await ask('Responda somente: CHATGPT ONLINE',{useMemory:false,reasoningEffort:'low',maxOutputTokens:80});return result}
  window.PinkOpenAI={ask,test,getStatus:()=>({status,model:lastModel,error:lastError}),endpoint};
  window.dispatchEvent(new CustomEvent('pinkopenai:ready'));
})();
