'use strict';
const assert=require('assert');
const gate=require('../foundation/pink-confirm-gate');
const undo=require('../foundation/pink-undo-stack');
(async()=>{
  await assert.rejects(()=>gate.resolveFromUi('forged_by_model'),/confirmation_missing_or_expired/);
  let request=null,ran=false;
  gate.setConfirmationHandlers({onRequested:x=>{request=x}});
  const issued=gate.requestConfirmation({title:'Apagar produção?',actionId:'delete:tenant-x',detail:'irreversível',run:()=>{ran=true;return 'ok'}});
  assert.equal(ran,false);assert.equal(request.id,issued.id);assert.equal(request.actionId,'delete:tenant-x');assert.equal(gate.pendingCount(),1);
  assert.equal(await gate.resolveFromUi(issued.id),'ok');assert.equal(ran,true);assert.equal(gate.pendingCount(),0);
  await assert.rejects(()=>gate.resolveFromUi(issued.id),/confirmation_missing_or_expired/);
  let cancelledRan=false;const c=gate.requestConfirmation({title:'Revogar',run:()=>{cancelledRan=true}});assert.equal(gate.cancelFromUi(c.id),true);assert.equal(cancelledRan,false);
  undo.clear();let value=30;const before=80;undo.pushUndo('volume',()=>{value=before;return 'restaurado'});assert.equal(await undo.undoLast(),'restaurado');assert.equal(value,80);assert.match(await undo.undoLast(),/nada/i);
  for(let i=0;i<undo.MAX_DEPTH+5;i++)undo.pushUndo(`a${i}`,()=>i);assert.equal(undo.depth(),undo.MAX_DEPTH);
  console.log('confirm/undo contracts: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
