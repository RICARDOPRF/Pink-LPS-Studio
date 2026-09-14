// Pink Engineering Panel — adds controlled engineering visibility to the autonomy console.
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function ensureTab(){
    const tabs=document.querySelector('.pink-autonomy-tabs');
    if(!tabs||tabs.querySelector('[data-pink-engineering-tab]'))return;
    const btn=document.createElement('button');
    btn.type='button';btn.dataset.pinkEngineeringTab='1';btn.textContent='Engenharia';
    btn.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');render()});
    tabs.appendChild(btn);
  }
  function render(){
    const body=document.getElementById('pinkAutonomyBody');if(!body)return;
    const snap=window.PinkEngineering?.snapshot?.()||{candidates:[],runs:[],autonomyLevel:window.PinkAutonomy?.getLevel?.()??0};
    const candidates=(snap.candidates||[]).slice(0,10),runs=(snap.runs||[]).slice().reverse().slice(0,10);
    body.innerHTML=`<div class="pink-kpi-row"><div class="pink-kpi"><small>Autonomia</small><strong>N${esc(snap.autonomyLevel)}</strong></div><div class="pink-kpi"><small>Candidatos</small><strong>${candidates.length}</strong></div><div class="pink-kpi"><small>Labs</small><strong>${runs.length}</strong></div><div class="pink-kpi"><small>Produção automática</small><strong>Bloqueada</strong></div></div><div class="pink-autonomy-note">Pipeline de engenharia: problema → candidato → plano → aprovação → branch isolada → testes → revisão → pronto para PR. Merge em main e publicação em produção continuam fora da autonomia.</div><div class="pink-list">${candidates.length?candidates.map(c=>{const p=window.PinkEngineering?.prepare?.(c)||{};return `<div class="pink-row"><div><strong>${esc(c.title||c.kind)}</strong><p>${esc(`${c.kind||'improvement'} · branch prevista ${p.branchName||'-'} · score ${Number(c.score||0).toFixed(2)}`)}</p></div><span class="pink-chip ${Number(c.score||0)>=.6?'good':'warn'}">${esc(c.status||'candidate')}</span></div>`}).join(''):'<div class="pink-row"><div><strong>Nenhum candidato priorizado</strong><p>A Pink continua observando falhas, desempenho, feedback e correções.</p></div><span class="pink-chip good">monitorando</span></div>'}</div>${runs.length?`<div style="height:12px"></div><div class="pink-list">${runs.map(r=>`<div class="pink-row"><div><strong>${esc(r.candidateId||r.id)}</strong><p>${esc(`${r.branch||'-'} · ${r.reason||'sem bloqueio reportado'}`)}</p></div><span class="pink-chip ${/ready|completed/.test(r.status)?'good':'warn'}">${esc(r.status)}</span></div>`).join('')}</div>`:''}`;
  }
  function boot(){ensureTab();window.addEventListener('pinkengineering:run',()=>{if(document.querySelector('[data-pink-engineering-tab].active'))render()});}
  window.addEventListener('pinkengineering:ready',boot,{once:true});
  window.addEventListener('pinkplatform:ready',boot);
  if(document.readyState!=='loading')queueMicrotask(boot);else document.addEventListener('DOMContentLoaded',boot,{once:true});
})();
