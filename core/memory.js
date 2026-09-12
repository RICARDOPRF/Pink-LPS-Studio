(() => {
  'use strict';
  const KEY='pink_context_memory_v1',CATEGORIES=new Set(['preferences','projects','decisions','lessons','notes']);
  const clean=(value,max=800)=>String(value??'').replace(/\b(?:pk|sk)_[A-Za-z0-9_-]{12,}\b/g,'[redacted-key]').replace(/\b[A-Fa-f0-9]{40,}\b/g,'[redacted-token]').slice(0,max);
  const fresh=()=>({schema:1,preferences:{},projects:{},decisions:{},lessons:{},notes:{},updatedAt:Date.now()});
  const load=()=>{try{return{...fresh(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return fresh()}};let mem=load();
  const save=()=>{mem.updatedAt=Date.now();try{localStorage.setItem(KEY,JSON.stringify(mem))}catch{}};
  const remember=(category,key,value,meta={})=>{if(!CATEGORIES.has(category))category='notes';const k=clean(key,100);if(!k)return null;mem[category]||={};mem[category][k]={value:clean(value),source:clean(meta.source||'runtime',80),confidence:Math.max(0,Math.min(1,Number(meta.confidence??0.7))),updatedAt:new Date().toISOString()};save();return mem[category][k]};
  const forget=(category,key)=>{if(mem[category]?.[key]){delete mem[category][key];save();return true}return false};
  const snapshot=()=>JSON.parse(JSON.stringify(mem));
  const context=(limit=18)=>{const lines=['[PINK CONTEXT MEMORY]'];let count=0;for(const category of CATEGORIES){for(const[key,entry]of Object.entries(mem[category]||{})){if(count++>=limit)break;lines.push(`${category}/${key}: ${entry.value}`)}if(count>=limit)break}return lines.join('\n')};
  window.PinkMemory={remember,forget,snapshot,context};
})();
