// Pink Recall Gate — returns only context that is relevant to the current goal.
(() => {
  const stop=new Set('a o as os de da do das dos e em para por com sem que um uma no na nos nas is the of and to for in on'.split(/\s+/));
  const tok=(s)=>new Set(String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_\- ]/g,' ').split(/\s+/).filter(x=>x.length>2&&!stop.has(x)));
  function score(query,item){
    const q=tok(query), t=tok([item.title,item.text,item.project,item.kind].filter(Boolean).join(' '));
    if(!q.size||!t.size)return 0;
    let common=0; for(const x of q) if(t.has(x)) common++;
    const overlap=common/Math.sqrt(q.size*t.size);
    const importance=Math.max(0,Math.min(1,Number(item.importance??.5)));
    const age=Math.max(0,Date.now()-Number(item.updatedAt||item.createdAt||Date.now()));
    const recency=Math.exp(-age/(1000*60*60*24*45));
    return overlap*.72+importance*.18+recency*.10;
  }
  function select(query,items,{limit=6,minScore=.12}={}){
    return (items||[]).map(item=>({item,score:score(query,item)})).filter(x=>x.score>=minScore)
      .sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>({...x.item,_recallScore:+x.score.toFixed(3)}));
  }
  window.PinkRecallGate={select,score};
})();
