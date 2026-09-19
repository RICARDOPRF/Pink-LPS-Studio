(() => {
  'use strict';
  const SAMPLE='Olá. Eu sou a Pink. Essa é uma demonstração da minha voz para a Lean Performance Solutions.';
  const $=s=>document.querySelector(s);
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function mount(){
    const dialog=$('#settingsDialog'),catalog=window.PinkVoiceCatalog;if(!dialog||!catalog||dialog.querySelector('#pinkVoiceLibrary'))return;
    const card=dialog.querySelector('.settings-card');if(!card)return;
    const wrap=document.createElement('section');wrap.id='pinkVoiceLibrary';wrap.className='pink-voice-library';
    wrap.innerHTML='<div class="pink-voice-head"><div><small>VOZ DA PINK</small><h3>Biblioteca de vozes</h3><p>30 vozes Gemini TTS. Escolha ouvindo uma prévia.</p></div><span class="pink-voice-chip" id="pinkVoiceSelected"></span></div><div class="pink-voice-toolbar"><input id="pinkVoiceSearch" type="search" placeholder="Buscar voz ou estilo" aria-label="Buscar voz"><select id="pinkVoiceGroup" aria-label="Filtrar vozes"><option value="all">Todas</option><option value="soft">Suaves</option><option value="firm">Firmes</option><option value="lively">Vivas</option><option value="mature">Maduras/texturizadas</option></select></div><div class="pink-voice-grid" id="pinkVoiceGrid"></div><div class="pink-voice-actions"><button type="button" class="secondary-btn" id="pinkVoicePreview">▶ Ouvir selecionada</button><button type="button" class="primary-btn" id="pinkVoiceUse">Usar esta voz</button></div><p class="pink-voice-note">Os rótulos de estilo são descritivos. A melhor forma de escolher é pela prévia.</p>';
    const actions=card.querySelector('.dialog-actions');card.insertBefore(wrap,actions||null);
    const search=wrap.querySelector('#pinkVoiceSearch'),group=wrap.querySelector('#pinkVoiceGroup'),grid=wrap.querySelector('#pinkVoiceGrid'),selected=wrap.querySelector('#pinkVoiceSelected');
    let state=catalog.getPreference(),draft=state.voice;group.value=state.group;
    function render(){
      const q=String(search.value||'').toLowerCase().trim(),pred=catalog.groups[group.value]||catalog.groups.all;
      grid.textContent='';
      catalog.voices.filter(v=>pred(v)&&(!q||v.name.toLowerCase().includes(q)||v.label.toLowerCase().includes(q)||v.trait.toLowerCase().includes(q))).forEach(v=>{
        const b=document.createElement('button');b.type='button';b.className='pink-voice-card';b.dataset.voice=v.name;b.setAttribute('aria-pressed',String(v.name===draft));
        b.innerHTML='<strong>'+esc(v.name)+'</strong><span>'+esc(v.label)+'</span><small>'+esc(v.trait)+'</small>';
        b.addEventListener('click',()=>{draft=v.name;render()});grid.appendChild(b);
      });
      const meta=catalog.find(draft);selected.textContent=(meta?.name||draft)+' · '+(meta?.label||'');
    }
    search.addEventListener('input',render);group.addEventListener('change',()=>{state={...state,group:group.value};render()});
    wrap.querySelector('#pinkVoicePreview').addEventListener('click',async e=>{const btn=e.currentTarget,old=btn.textContent;btn.disabled=true;btn.textContent='Falando…';try{await window.PinkNeuralTTS?.speak?.(SAMPLE,{voice:draft})}catch(_){btn.textContent='Falha na prévia'}finally{setTimeout(()=>{btn.disabled=false;btn.textContent=old},800)}});
    wrap.querySelector('#pinkVoiceUse').addEventListener('click',()=>{state=catalog.setPreference({voice:draft,group:group.value});selected.textContent=catalog.find(state.voice).name+' · '+catalog.find(state.voice).label;const status=$('#voiceStatus');if(status)status.textContent='Pink Neural Voice · '+state.voice});
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();