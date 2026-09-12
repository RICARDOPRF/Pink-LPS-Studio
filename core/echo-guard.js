// Pink Echo Guard — prevents the assistant's own spoken phrase from retriggering wake/transcript logic.
(() => {
  let recent=[];
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  function rememberAssistant(text,ttlMs=12000){const n=norm(text);if(!n)return;recent.push({n,until:Date.now()+ttlMs});recent=recent.slice(-12)}
  function isEcho(text){
    const now=Date.now();recent=recent.filter(x=>x.until>now);const n=norm(text);if(!n)return false;
    return recent.some(x=>x.n===n||(n.length>18&&(x.n.includes(n)||n.includes(x.n))));
  }
  window.PinkEchoGuard={rememberAssistant,isEcho};
})();
