'use strict';
const assert = require('node:assert');
const foundationApi = require('../foundation/pink-foundation.js');
const coreApi = require('../core/pink-operating-core.js');

(async () => {
  const config = {
    schemaVersion:2, appVersion:'12.0.0', environment:'development',
    supabase:{
      url:'https://membyrbgynicllzrhjsl.supabase.co',
      anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0'
    },
    voice:{provider:'gemini-live',model:'models/gemini-3.1-flash-live-preview',voiceName:'Aoede'},
    features:{pink3d:true}
  };
  const foundation = foundationApi.createFoundation(config);
  assert.strictEqual(foundation.health().ok,true);
  const core = coreApi.create({foundation});

  assert.strictEqual(core.version,'1.0.0');
  assert.strictEqual(core.awareness.snapshot().currentAgent,'chatgpt-supervisor');
  core.awareness.update({activeProject:'beccs',currentBranch:'phase/1-core-intelligence'});
  assert.strictEqual(core.awareness.snapshot().activeProject,'beccs');

  core.context.setActive({type:'dashboard',project:'forno-panela',url:'https://example.test'});
  assert.strictEqual(core.context.snapshot().active.project,'forno-panela');
  core.context.setActive({type:'ecommerce',project:'praia'});
  assert.strictEqual(core.context.snapshot().history.length,1);

  assert.throws(()=>core.tasks.transition('missing','running'),/unknown_task/);
  const stateTask=core.tasks.create({id:'state-task',title:'state'});
  assert.strictEqual(stateTask.status,'pending');
  core.tasks.transition('state-task','running');
  assert.throws(()=>core.tasks.transition('state-task','pending'),/invalid_task_transition/);
  core.tasks.transition('state-task','completed');

  let calls=0;
  core.capabilities.register({
    name:'test.read',risk:'READ_ONLY',timeoutMs:200,maxRetries:0,
    handler:async input=>({echo:input.value})
  });
  const ok=await core.executor.execute({capability:'test.read',input:{value:42},task:{id:'read-ok',title:'read'}});
  assert.strictEqual(ok.status,'completed');
  assert.strictEqual(ok.result.echo,42);

  core.capabilities.register({
    name:'test.retry',risk:'READ_ONLY',timeoutMs:200,maxRetries:1,
    handler:async()=>{calls++;if(calls===1)throw new Error('transient');return {ok:true}}
  });
  const retried=await core.executor.execute({capability:'test.retry',task:{id:'retry-task',title:'retry'}});
  assert.strictEqual(retried.status,'completed');
  assert.strictEqual(calls,2);

  core.capabilities.register({
    name:'test.write',risk:'EXTERNAL_WRITE',timeoutMs:200,maxRetries:0,
    handler:async()=>({ok:true})
  });
  const blocked=await core.executor.execute({capability:'test.write',task:{id:'write-task',title:'write'}});
  assert.strictEqual(blocked.status,'blocked_external');

  core.capabilities.register({
    name:'test.timeout',risk:'READ_ONLY',timeoutMs:10,maxRetries:0,
    handler:async()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true}),100))
  });
  const timeout=await core.executor.execute({capability:'test.timeout',task:{id:'timeout-task',title:'timeout'}});
  assert.strictEqual(timeout.status,'timeout');

  core.capabilities.register({
    name:'test.unknown',risk:'READ_ONLY',timeoutMs:50,maxRetries:0,
    handler:null
  });
  const unknown=await core.executor.execute({capability:'missing.capability',task:{id:'missing-cap',title:'missing'}});
  assert.strictEqual(unknown.status,'blocked_external');

  assert.strictEqual(core.tasks.list().every(t=>['pending','running','completed','failed','cancelled','timeout','blocked_external'].includes(t.status)),true);
  assert.strictEqual(core.tasks.list().some(t=>t.status==='running'),false);
  assert.strictEqual(core.health().tasksStuckRunning.length,0);
  console.log('Pink Core Intelligence contract: OK');
})().catch(error=>{console.error(error);process.exit(1)});
