// Pink grounded web research adapter — server-side Gemini + Google Search.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkGeminiResearch=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const cfg=()=>root.PinkPublicConfig?.supabase||{};
const endpoint=()=>`${String(cfg().url||'').replace(/\/$/,'')}/functions/v1/${cfg().functions?.geminiReasoning||'pink-gemini-reasoning'}`;
const headers=()=>({'Content-Type':'application/json',apikey:cfg().anonKey,Authorization:`Bearer ${cfg().anonKey}`});
let state={status:'idle',lastError:null,lastUsedAt:null,lastSources:[]};
async function search(prompt,options={}){
 const input=String(prompt||'').trim();if(!input)throw new Error('research_input_required');
 if(!cfg().url||!cfg().anonKey)throw new Error('research_backend_config_missing');
 state={...state,status:'searching',lastError:null,lastUsedAt:new Date().toISOString()};
 const response=await fetch(endpoint(),{method:'POST',headers:headers(),body:JSON.stringify({input,search:true,temperature:options.temperature??0.2,maxOutputTokens:options.maxOutputTokens??1800})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data?.ok){const message=data?.providerMessage||data?.detail||data?.error||`research_http_${response.status}`;state={...state,status:'degraded',lastError:String(message)};throw new Error(String(message))}
 const reply=String(data.reply||data.output||'').trim();if(!reply)throw new Error('research_empty_output');
 const sources=Array.isArray(data.sources)?data.sources.filter(x=>x?.url).slice(0,12):[];
 state={status:'healthy',lastError:null,lastUsedAt:new Date().toISOString(),lastSources:sources};
 try{root.dispatchEvent?.(new CustomEvent('pinkresearch:result',{detail:{reply,sources,queries:data.queries||[]}}))}catch(_){}
 return {reply,report:reply,sources,queries:data.queries||[],provider:data.provider||'gemini-google-search',model:data.model||null,grounded:Boolean(data.grounded)};
}
function snapshot(){return JSON.parse(JSON.stringify({version:'1.0.0',...state}))}
return Object.freeze({version:'1.0.0',search,invoke:task=>search(task?.prompt||task?.input||'',task?.options||{}),snapshot});
});
