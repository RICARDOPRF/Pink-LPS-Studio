// Pink Memory Curator V1 — clean-room bounded/relevant memory helper.
// It does not replace PinkCore people memory and never stores raw audio.
(() => {
  const KEY = 'pink_memory_curator_v1';
  const MAX_CHARS = 2200;
  const CATEGORIES = ['identity','preferences','projects','relationships','wishes','notes'];

  const clean = (v, max=380) => String(v ?? '')
    .replace(/(?:sk|pk)_[A-Za-z0-9_-]{12,}/g,'[redacted-key]')
    .replace(/[A-Fa-f0-9]{40,}/g,'[redacted-token]')
    .trim().slice(0,max);

  function blank(){ return Object.fromEntries(CATEGORIES.map(c => [c, {}])); }
  function load(){
    try{
      const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Object.assign(blank(), parsed && typeof parsed === 'object' ? parsed : {});
    }catch(_){ return blank(); }
  }
  function sizeOf(data){ return JSON.stringify(data).length; }
  function trim(data){
    const rows=[];
    for(const category of CATEGORIES){
      for(const [key,entry] of Object.entries(data[category] || {})){
        rows.push({category,key,updated:entry.updated || '0000-00-00'});
      }
    }
    rows.sort((a,b)=>String(a.updated).localeCompare(String(b.updated)));
    while(sizeOf(data) > MAX_CHARS && rows.length){
      const oldest=rows.shift();
      delete data[oldest.category][oldest.key];
    }
    return data;
  }
  function save(data){
    const safe=trim(data);
    try{ localStorage.setItem(KEY, JSON.stringify(safe)); }catch(_){}
    return safe;
  }
  function relevanceGate(text=''){
    const t=clean(text,800).toLowerCase();
    if(!t) return {remember:false,reasons:[]};
    const rules = [
      ['identity', /\b(meu nome|eu sou|moro em|trabalho (?:em|na|no)|minha idade|anivers[aá]rio)\b/i],
      ['preferences', /\b(gosto de|prefiro|favorit[oa]|não gosto|nao gosto)\b/i],
      ['projects', /\b(projeto|aplicativo|sistema|estou criando|estou desenvolvendo|objetivo)\b/i],
      ['relationships', /\b(amig[oa]|namorad[oa]|espos[oa]|irm[aã]o|irm[aã]|m[aã]e|pai|colega|s[oó]ci[oa])\b/i],
      ['wishes', /\b(quero|pretendo|planejo|sonho|vou comprar|vou viajar)\b/i],
    ];
    const reasons=rules.filter(([,rx])=>rx.test(t)).map(([name])=>name);
    return {remember:reasons.length>0,reasons};
  }
  function upsert(category,key,value,source='explicit'){
    if(!CATEGORIES.includes(category)) throw new Error('invalid memory category');
    const k=clean(key,80).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
    const v=clean(value,380); if(!k || !v) return null;
    const data=load();
    data[category][k]={value:v,updated:new Date().toISOString().slice(0,10),source:clean(source,32)};
    save(data); return data[category][k];
  }
  function tokenize(v=''){
    return new Set(clean(v,1000).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .split(/[^a-z0-9]+/).filter(x=>x.length>2));
  }
  function recall(query='', limit=12){
    const q=tokenize(query); const data=load(); const scored=[];
    for(const category of CATEGORIES){
      for(const [key,entry] of Object.entries(data[category] || {})){
        const words=tokenize(`${category} ${key} ${entry.value || ''}`);
        let score=0; for(const w of q) if(words.has(w)) score+=1;
        if(score || !q.size) scored.push({category,key,...entry,score});
      }
    }
    return scored.sort((a,b)=>(b.score-a.score)||String(b.updated).localeCompare(String(a.updated))).slice(0,limit);
  }
  function snapshot(){ return load(); }
  window.PinkMemoryCurator = { relevanceGate, upsert, recall, snapshot, maxChars:MAX_CHARS };
})();
