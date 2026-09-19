(() => {
  'use strict';
  const VOICES = Object.freeze([
    ['Zephyr','Brilhante','bright'],
    ['Puck','Animada','upbeat'],
    ['Charon','Informativa','informative'],
    ['Kore','Firme','firm'],
    ['Fenrir','Excitável','excitable'],
    ['Leda','Jovem','youthful'],
    ['Orus','Firme','firm'],
    ['Aoede','Leve','breezy'],
    ['Callirrhoe','Tranquila','easy-going'],
    ['Autonoe','Brilhante','bright'],
    ['Enceladus','Soprosa','breathy'],
    ['Iapetus','Clara','clear'],
    ['Umbriel','Tranquila','easy-going'],
    ['Algieba','Suave','smooth'],
    ['Despina','Suave','smooth'],
    ['Erinome','Clara','clear'],
    ['Algenib','Texturizada','gravelly'],
    ['Rasalgethi','Informativa','informative'],
    ['Laomedeia','Animada','upbeat'],
    ['Achernar','Macia','soft'],
    ['Alnilam','Firme','firm'],
    ['Schedar','Equilibrada','even'],
    ['Gacrux','Madura','mature'],
    ['Pulcherrima','Direta','forward'],
    ['Achird','Amigável','friendly'],
    ['Zubenelgenubi','Casual','casual'],
    ['Vindemiatrix','Gentil','gentle'],
    ['Sadachbia','Viva','lively'],
    ['Sadaltager','Conhecedora','knowledgeable'],
    ['Sulafat','Quente','warm'],
  ].map(([name,label,trait])=>Object.freeze({name,label,trait,provider:'gemini-tts'})));
  const GROUPS=Object.freeze({
    all:()=>true,
    soft:v=>['breezy','easy-going','smooth','soft','gentle','warm','breathy'].includes(v.trait),
    firm:v=>['firm','forward','informative','knowledgeable','clear','even'].includes(v.trait),
    lively:v=>['upbeat','excitable','youthful','bright','lively','friendly','casual'].includes(v.trait),
    mature:v=>['mature','gravelly'].includes(v.trait),
  });
  const KEY='pink.voice.preference.v1';
  function getPreference(){
    try{
      const raw=localStorage.getItem(KEY);if(!raw)return {voice:'Aoede',group:'all'};
      const parsed=JSON.parse(raw);const voice=VOICES.some(v=>v.name===parsed?.voice)?parsed.voice:'Aoede';
      return {voice,group:GROUPS[parsed?.group]?parsed.group:'all'};
    }catch(_){return {voice:'Aoede',group:'all'}}
  }
  function setPreference(input={}){
    const current=getPreference();const voice=VOICES.some(v=>v.name===input.voice)?input.voice:current.voice;
    const group=GROUPS[input.group]?input.group:current.group;const next={voice,group};
    try{localStorage.setItem(KEY,JSON.stringify(next))}catch(_){}
    window.dispatchEvent(new CustomEvent('pinkvoice:preference',{detail:next}));
    return next;
  }
  function find(name){return VOICES.find(v=>v.name===name)||VOICES.find(v=>v.name==='Aoede')}
  window.PinkVoiceCatalog=Object.freeze({version:'1.0.0',voices:VOICES,groups:GROUPS,getPreference,setPreference,find,key:KEY});
})();