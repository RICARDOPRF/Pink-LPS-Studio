(() => {
  'use strict';
  const KEY = 'pink_awareness_v1';
  const MAX_EVENTS = 30;
  const clean = (value, max = 220) => String(value ?? '')
    .replace(/\b(?:pk|sk)_[A-Za-z0-9_-]{12,}\b/g, '[redacted-key]')
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, '[redacted-token]')
    .slice(0, max);
  const fresh = () => ({schema:1,currentApp:'Pink LPS Studio',currentProject:'Pink-LPS-Studio',currentActivity:'idle',currentGoal:'',activeTool:'',lastAction:'',recentEvents:[],updatedAt:Date.now()});
  const load = () => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh(); } };
  let state = load();
  const snapshot = () => JSON.parse(JSON.stringify(state));
  const save = () => { state.updatedAt=Date.now(); state.recentEvents=state.recentEvents.slice(-MAX_EVENTS); try{localStorage.setItem(KEY,JSON.stringify(state))}catch{} window.dispatchEvent(new CustomEvent('pink:awareness',{detail:snapshot()})); };
  const recordEvent=(type,detail='')=>{state.recentEvents.push({at:new Date().toISOString(),type:clean(type,60),detail:clean(detail)});save();};
  const update=(patch={})=>{for(const key of ['currentApp','currentProject','currentActivity','currentGoal','activeTool','lastAction'])if(Object.prototype.hasOwnProperty.call(patch,key))state[key]=clean(patch[key]);save();return snapshot();};
  const setGoal=(goal)=>{update({currentGoal:goal,currentActivity:'working'});recordEvent('goal',goal);};
  const setTool=(tool,action='')=>{update({activeTool:tool,lastAction:action,currentActivity:'executing'});recordEvent('tool',`${tool}${action?`: ${action}`:''}`);};
  const clearTool=()=>update({activeTool:'',currentActivity:'idle'});
  const promptContext=()=>{const s=snapshot();const events=s.recentEvents.slice(-6).map(e=>`- ${e.type}: ${e.detail}`).join('\n');return ['[PINK AWARENESS]',`App: ${s.currentApp||'unknown'}`,`Project: ${s.currentProject||'unknown'}`,`Activity: ${s.currentActivity||'unknown'}`,`Goal: ${s.currentGoal||'none'}`,`Active tool: ${s.activeTool||'none'}`,`Last action: ${s.lastAction||'none'}`,events?`Recent events:\n${events}`:''].filter(Boolean).join('\n');};
  window.PinkAwareness={snapshot,update,setGoal,setTool,clearTool,recordEvent,promptContext};
})();
