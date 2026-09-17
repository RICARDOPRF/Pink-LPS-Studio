const TEXT_EXT=new Set(['txt','md','csv','json','log','xml','html','htm','js','mjs','cjs','ts','tsx','jsx','css','yml','yaml','sql']);
const MAX_FILE_BYTES=15*1024*1024;
const MAX_TEXT_CHARS=120000;
function ext(name=''){return String(name).split('.').pop().toLowerCase()}
function cleanText(value){return String(value||'').replace(/\u0000/g,'').slice(0,MAX_TEXT_CHARS)}

export function supportedFile(file){
  const e=ext(file?.name);const type=String(file?.type||'').toLowerCase();
  return TEXT_EXT.has(e)||type.startsWith('text/')||type==='application/json'||type==='application/pdf';
}

export async function readBrowserFile(file){
  if(!file)throw new Error('file_missing');
  if(file.size>MAX_FILE_BYTES)throw new Error('file_too_large');
  const e=ext(file.name);const type=String(file.type||'').toLowerCase();
  const meta={name:file.name,size:file.size,type:type||'application/octet-stream',extension:e};
  if(TEXT_EXT.has(e)||type.startsWith('text/')||type==='application/json'){
    return {...meta,kind:'text',text:cleanText(await file.text())};
  }
  if(type==='application/pdf'||e==='pdf'){
    return {...meta,kind:'pdf',buffer:await file.arrayBuffer(),message:'PDF recebido. A extração deve ser feita por um parser/backend de documentos; não enviar bytes brutos ao modelo.'};
  }
  return {...meta,kind:'unsupported',message:'Formato recebido, mas ainda sem extrator seguro nesta versão.'};
}

export function buildFilePrompt(files,userPrompt=''){
  const readable=files.filter(x=>x.kind==='text'&&x.text);
  const manifest=files.map(x=>`- ${x.name} (${x.kind}, ${x.size} bytes)${x.message?`: ${x.message}`:''}`).join('\n');
  const contents=readable.map(x=>`\n--- ARQUIVO: ${x.name} ---\n${x.text}`).join('\n');
  return [`Arquivos anexados pelo usuário:\n${manifest}`,contents,`Pedido do usuário: ${String(userPrompt||'Analise os arquivos anexados.')}`].filter(Boolean).join('\n\n');
}
