(() => {
  'use strict';
  const DEFAULTS = [
    {name:'Magpie-Multilingual.PT-BR.Diego',label:'Diego',trait:'masculina',provider:'nvidia-magpie'},
    {name:'Magpie-Multilingual.PT-BR.Louise',label:'Louise',trait:'feminina',provider:'nvidia-magpie'},
    {name:'Magpie-Multilingual.PT-BR.Isabela',label:'Isabela',trait:'feminina',provider:'nvidia-magpie'},
  ];
  let voices=DEFAULTS.slice();
  const KEY='pink.voice.preference.v2';
  const GROUPS=Object.freeze({all:()=>true,male:v=>v.trait==='masculina',female:v=>v.trait==='feminina'});
  function normalize(name){const n=String(name||'');const label=n.split('.').pop()||n;return {name:n,label,trait:label==='Diego'?'masculina':'feminina',provider:'nvidia-magpie'};}
  function getPreference(){try{const p=JSON.parse(localStorage.getItem(KEY)||'{}');return {voice:voices.some(v=>v.name===p.voice)?p.voice:'Magpie-Multilingual.PT-BR.Isabela',group:GROUPS[p.group]?p.group:'all'};}catch{return {voice:'Magpie-Multilingual.PT-BR.Isabela',group:'all'}}}
  function setPreference(input={}){const cur=getPreference(),next={voice:voices.some(v=>v.name===input.voice)?input.voice:cur.voice,group:GROUPS[input.group]?input.group:cur.group};try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}window.dispatchEvent(new CustomEvent('pinkvoice:preference',{detail:next}));return next;}
  function find(name){return voices.find(v=>v.name===name)||voices[2]||voices[0];}
  function setVoices(names=[]){const pt=[...new Set(names.filter(n=>String(n).includes('.PT-BR.')))];if(pt.length)voices=pt.map(normalize);return voices.slice();}
  const api={version:'2.0.0',provider:'nvidia-magpie',groups:GROUPS,get voices(){return voices.slice()},getPreference,setPreference,find,setVoices,key:KEY};
  window.PinkVoiceCatalog=Object.freeze(api);
})();