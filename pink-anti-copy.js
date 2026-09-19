// PINK LPS STUDIO — ANTI-CÓPIA V1
// Dissuasão de cópia casual do conteúdo/código: bloqueia menu de contexto, seleção
// de texto e atalhos comuns de DevTools fora de campos de formulário.
// Aviso: isso NÃO é uma proteção forte (qualquer pessoa com conhecimento técnico
// consegue contornar via ferramentas externas de desenvolvedor); serve apenas
// para dificultar a cópia casual pela interface.
(function(){
'use strict';
function isFormField(el){
  return !!el && (el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable===true);
}
document.addEventListener('contextmenu',e=>{if(!isFormField(e.target))e.preventDefault();});
document.addEventListener('selectstart',e=>{if(!isFormField(e.target))e.preventDefault();});
document.addEventListener('copy',e=>{if(!isFormField(e.target))e.preventDefault();});
document.addEventListener('keydown',e=>{
  const k=e.key;
  const devtools=(e.ctrlKey||e.metaKey)&&e.shiftKey&&['I','J','C','i','j','c'].includes(k);
  const viewSource=(e.ctrlKey||e.metaKey)&&!e.shiftKey&&['u','U'].includes(k);
  const savePage=(e.ctrlKey||e.metaKey)&&!e.shiftKey&&['s','S'].includes(k);
  if(k==='F12'||devtools||viewSource||savePage){e.preventDefault();e.stopPropagation();}
},true);
})();
