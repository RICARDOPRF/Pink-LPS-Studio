'use strict';
const assert=require('node:assert/strict');
(async()=>{
  const speech=await import('../packages/voice/speech-text.mjs');
  const files=await import('../packages/files/browser-file-reader.mjs');
  const spoken=speech.toSpeechText('## Resultado\n**Perfeito**\n- item um\n- item dois\n[abrir](https://example.com)');
  assert.equal(/[\*_#]/.test(spoken),false,'spoken text must not verbalize markdown markers');
  assert.equal(/https?:\/\//.test(spoken),false,'spoken text must not verbalize raw URLs');
  assert.match(spoken,/Perfeito/);
  const fake={name:'obra.csv',size:18,type:'text/csv',text:async()=> 'tag,avanco\nA,50%\n'};
  const parsed=await files.readBrowserFile(fake);
  assert.equal(parsed.kind,'text');assert.match(parsed.text,/avanco/);
  const prompt=files.buildFilePrompt([parsed],'analise');assert.match(prompt,/obra\.csv/);assert.match(prompt,/A,50%/);
  let rejected=false;try{await files.readBrowserFile({name:'huge.txt',size:16*1024*1024,type:'text/plain',text:async()=>''})}catch(e){rejected=e.message==='file_too_large'}assert.equal(rejected,true);
  console.log('Natural speech + file reader contracts: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
