(() => {
  // Phase 0 bootstrap is additive: existing Pink behavior does not depend on it during startup.
  // Future phases can wait for `pinkfoundation:ready` before using approval/ledger primitives.
  function loadFoundationScript(src, marker) {
    if (document.querySelector(`script[data-pink-foundation="${marker}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(src, document.baseURI).href;
      script.dataset.pinkFoundation = marker;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }
  (async () => {
    try {
      if (!window.PinkPublicConfig) await loadFoundationScript('pink-public-config.js', 'config');
      if (!window.PinkFoundation) await loadFoundationScript('foundation/pink-foundation.js', 'core');
      const health = window.PinkFoundation?.health?.() || { ok: false };
      window.dispatchEvent(new CustomEvent('pinkfoundation:ready', { detail: health }));
      if (!health.ok) console.warn('Pink Foundation configuration is degraded', health);
    } catch (error) {
      console.warn('Pink Foundation bootstrap unavailable; legacy runtime preserved.', error);
      window.dispatchEvent(new CustomEvent('pinkfoundation:error', { detail: { message: String(error?.message || error) } }));
    }
  })();

  const STORAGE_KEY = 'pink_evolution_core_v1';
  const MAX_EVENTS = 80;
  const MAX_CANDIDATES = 30;
  const now = () => new Date().toISOString();
  const clean = (value, max = 160) => String(value ?? '')
    .replace(/pk_[A-Za-z0-9_-]+/g, '[public-key]')
    .replace(/sk_[A-Za-z0-9_-]+/g, '[secret]')
    .replace(/[A-Fa-f0-9]{32,}/g, '[token]')
    .slice(0, max);
  const fresh = () => ({
    schema: 1,
    createdAt: now(),
    updatedAt: now(),
    counters: { sessions: 0, errors: 0, listening: 0, thinking: 0, speaking: 0, executing: 0 },
    events: [],
    candidates: []
  });
  function load(){
    try { return {...fresh(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}; }
    catch { return fresh(); }
  }
  let state = load();
  function save(){
    state.updatedAt = now();
    state.events = state.events.slice(-MAX_EVENTS);
    state.candidates = state.candidates.slice(-MAX_CANDIDATES);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  function event(type, data={}){
    state.events.push({at: now(), type: clean(type, 48), ...data});
    save();
  }
  function candidate({kind='improvement', title, evidence='', priority='medium'}={}){
    title = clean(title, 120);
    if(!title) return null;
    const key = `${kind}:${title.toLowerCase()}`;
    const existing = state.candidates.find(c => c.key === key && c.status === 'candidate');
    if(existing){ existing.hits += 1; existing.lastSeenAt = now(); existing.evidence = clean(evidence, 220) || existing.evidence; save(); return existing; }
    const item = {id:`evo_${Date.now().toString(36)}`, key, kind:clean(kind,40), title, evidence:clean(evidence,220), priority, hits:1, status:'candidate', createdAt:now(), lastSeenAt:now(), productionApproved:false};
    state.candidates.push(item); save(); return item;
  }
  function recordIssue(type, detail=''){
    state.counters.errors = (state.counters.errors || 0) + 1;
    const msg = clean(detail, 180);
    event('issue',{issueType:clean(type,60), detail:msg});
    const recent = state.events.filter(e => e.type === 'issue' && e.issueType === clean(type,60)).length;
    if(recent >= 2) candidate({kind:'reliability', title:`Investigar recorrência: ${clean(type,70)}`, evidence:`Ocorrências recentes: ${recent}. ${msg}`, priority: recent >= 4 ? 'high' : 'medium'});
  }
  function recordState(name){
    const key = clean(name,30);
    if(Object.prototype.hasOwnProperty.call(state.counters,key)) state.counters[key] += 1;
    event('state',{state:key});
  }
  function recordSession(result='completed'){
    state.counters.sessions = (state.counters.sessions || 0) + 1;
    event('session',{result:clean(result,50)});
  }
  function feedback(signal, context=''){
    event('feedback',{signal:clean(signal,30), context:clean(context,180)});
    if(signal === 'negative') candidate({kind:'ux', title:'Revisar experiência após feedback negativo', evidence:context, priority:'high'});
  }
  function snapshot(){ return JSON.parse(JSON.stringify(state)); }
  function exportReviewPacket(){
    const s=snapshot();
    return {
      generatedAt: now(),
      counters:s.counters,
      openCandidates:s.candidates.filter(c=>c.status==='candidate').sort((a,b)=>({high:3,medium:2,low:1}[b.priority]||0)-({high:3,medium:2,low:1}[a.priority]||0)).slice(0,12),
      recentEvents:s.events.slice(-20),
      policy:'OBSERVE_AND_PROPOSE_ONLY'
    };
  }
  window.PinkEvolution = { recordState, recordIssue, recordSession, feedback, addCandidate:candidate, snapshot, exportReviewPacket };
  window.addEventListener('error', e => recordIssue('runtime-error', e.message || 'erro JavaScript'));
  window.addEventListener('unhandledrejection', e => recordIssue('unhandled-promise', e.reason?.message || e.reason || 'promise rejeitada'));
})();
