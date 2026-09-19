// PINK LPS STUDIO — BLOQUEIO POR DOMÍNIO V1
// Desativado por padrão (lista vazia = não bloqueia ninguém). Para ativar,
// preencha ALLOWED_HOSTS com o(s) domínio(s) oficiais de publicação, ex.:
// 'studio.suaempresa.com.br'. Subdomínios do valor informado também são
// aceitos automaticamente. Enquanto a lista estiver vazia, este arquivo não
// tem nenhum efeito no funcionamento do app.
(function(){
'use strict';
const ALLOWED_HOSTS=[];
if(!ALLOWED_HOSTS.length)return;
const h=String(location.hostname||'').toLowerCase();
const allowed=ALLOWED_HOSTS.some(d=>h===d||h.endsWith('.'+d));
if(allowed)return;
document.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.innerHTML='<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050b14;color:#eef7ff;font-family:Segoe UI,Arial,sans-serif;text-align:center;padding:24px"><p>Este aplicativo não está autorizado para este domínio.</p></body>';
});
})();
