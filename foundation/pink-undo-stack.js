// Pink undo stack: reversible actions execute immediately and register a bounded inverse.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')root.PinkUndoStack=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const MAX_DEPTH=10;
const stack=[];
function pushUndo(label,undoFn,meta={}){if(typeof undoFn!=='function')throw new TypeError('pushUndo requires undoFn()');stack.push({label:String(label||'Ação'),undo:undoFn,meta:{...meta},at:Date.now()});if(stack.length>MAX_DEPTH)stack.shift();return stack.length}
async function undoLast(){const entry=stack.pop();if(!entry)return 'Não há nada para desfazer.';const result=await entry.undo();return result??`Desfeito: ${entry.label}`}
function peek(){const e=stack.at(-1);return e?{label:e.label,meta:{...e.meta},at:e.at}:null}
function peekLabel(){return peek()?.label||null}
function depth(){return stack.length}
function clear(){stack.length=0}
return Object.freeze({version:'1.0.0',MAX_DEPTH,pushUndo,undoLast,peek,peekLabel,depth,clear});
});
