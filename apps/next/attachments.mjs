import {readBrowserFile,buildFilePrompt} from '../../packages/files/browser-file-reader.mjs';
const prompt=document.querySelector('#prompt');const send=document.querySelector('#send');
if(prompt&&send){
  const input=document.createElement('input');input.type='file';input.id='file-input';input.multiple=true;input.hidden=true;input.accept='.txt,.md,.csv,.json,.log,.xml,.html,.js,.mjs,.ts,.css,.yml,.yaml,.sql,.pdf,text/*,application/json,application/pdf';
  const attach=document.createElement('button');attach.type='button';attach.id='attach-file';attach.className='attach-btn';attach.textContent='Anexar';attach.setAttribute('aria-label','Anexar arquivos para a Pink ler');
  const status=document.createElement('div');status.id='attachment-status';status.className='attachment-status';status.setAttribute('aria-live','polite');
  send.before(attach);document.querySelector('.composer-box')?.append(input,status);
  attach.addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const files=[...input.files];if(!files.length)return;attach.disabled=true;status.textContent='Lendo arquivos…';
    try{
      const parsed=[];for(const file of files)parsed.push(await readBrowserFile(file));
      const readable=parsed.filter(x=>x.kind==='text');const unsupported=parsed.filter(x=>x.kind!=='text');
      if(readable.length){const existing=prompt.value.trim();prompt.value=buildFilePrompt(parsed,existing||'Leia e analise os arquivos anexados.');prompt.dispatchEvent(new Event('input',{bubbles:true}));}
      status.textContent=`${readable.length} arquivo(s) pronto(s) para leitura${unsupported.length?`; ${unsupported.map(x=>x.name).join(', ')} recebido(s), mas ainda sem extração de conteúdo nesta versão`:''}.`;
    }catch(error){status.textContent=`Não consegui anexar: ${String(error?.message||error)}`}
    finally{attach.disabled=false;input.value=''}
  });
}
