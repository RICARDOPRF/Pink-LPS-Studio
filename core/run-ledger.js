// Pink Run Ledger — every autonomous job must reach a terminal state.
(() => {
  const KEY='pink_run_ledger_v1', LIMIT=60;
  const TERMINAL=new Set(['succeeded','failed','cancelled','timed_out']);
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const save=(rows)=>{try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-LIMIT)))}catch{}};
  let rows=load();
  function start({kind='task',label='Untitled',timeoutMs=15*60*1000,meta={}}={}) {
    const run={id:`run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,kind,label:String(label).slice(0,120),
      status:'running',createdAt:Date.now(),updatedAt:Date.now(),timeoutMs,meta,events:[{at:Date.now(),type:'started'}]};
    rows.push(run); save(rows); return run.id;
  }
  function transition(id,status,detail='') {
    const run=rows.find(r=>r.id===id); if(!run) return false;
    if(TERMINAL.has(run.status)) return false;
    const allowed=new Set(['running','waiting_approval','reviewing','testing','succeeded','failed','cancelled','timed_out']);
    if(!allowed.has(status)) return false;
    run.status=status; run.updatedAt=Date.now(); run.events.push({at:Date.now(),type:status,detail:String(detail).slice(0,240)});
    save(rows); return true;
  }
  function sweep(now=Date.now()) {
    for(const run of rows) if(!TERMINAL.has(run.status) && run.timeoutMs>0 && now-run.updatedAt>run.timeoutMs) transition(run.id,'timed_out','heartbeat timeout');
  }
  function heartbeat(id,detail='') {
    const run=rows.find(r=>r.id===id); if(!run||TERMINAL.has(run.status)) return false;
    run.updatedAt=Date.now(); if(detail) run.events.push({at:Date.now(),type:'heartbeat',detail:String(detail).slice(0,160)}); save(rows); return true;
  }
  function snapshot(){sweep();return JSON.parse(JSON.stringify(rows));}
  setInterval(()=>sweep(),30000);
  window.PinkRunLedger={start,transition,heartbeat,sweep,snapshot,terminal:[...TERMINAL]};
})();
