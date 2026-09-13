'use strict';
const assert = require('node:assert');
const foundationApi = require('../foundation/pink-foundation.js');
const coreApi = require('../core/pink-operating-core.js');

(async () => {
  const config = {
    schemaVersion:1, appVersion:'10.1.0', environment:'development',
    supabase:{
      url:'https://membyrbgynicllzrhjsl.supabase.co',
      anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0'
    },
    voice:{provider:'elevenlabs',agentId:'agent_0001m2brk3bxes2vwzc26rpzqww4',branchId:'agtbrch_2101m2brk4sremv9s75zgjgt61q4'},
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
  core.capabilities.register({
    name:'test.retry',risk:'READ_ONLY',timeoutMs:200,maxRetries:1,
    handler:async()=>{calls+=1;if(calls===1)throw new Error('transient');return 'recovered'}
  });
  core.capabilities.register({
    name:'test.fallback',risk:'READ_ONLY',timeoutMs:100,maxRetries:0,
    handler:async()=>{throw new Error('provider-down')}, fallback:async()=> 'fallback-ok'
  });
  core.capabilities.register({
    name:'test.timeout',risk:'READ_ONLY',timeoutMs:50,maxRetries:0,
    handler:()=>new Promise(()=>{})
  });
  core.capabilities.register({
    name:'test.write',risk:'EXTERNAL_WRITE',timeoutMs:200,maxRetries:0,
    handler:async()=> 'written'
  });

  const invalid=core.plan('unknown tool',{capabilities:['does.not.exist']});
  assert.strictEqual(invalid.valid,false);
  assert.deepStrictEqual(invalid.unknownCapabilities,['does.not.exist']);
  await assert.rejects(()=>core.execute(invalid),/invalid_plan/);

  const simple=core.plan('read and retry',{steps:[
    {capability:'test.read',input:{value:42}},
    {capability:'test.retry'}
  ]});
  assert.strictEqual(simple.valid,true);
  const simpleResult=await core.execute(simple);
  assert.strictEqual(simpleResult.status,'completed');
  assert.strictEqual(simpleResult.results[0].value.echo,42);
  assert.strictEqual(simpleResult.results[1].recovered,true);
  assert.strictEqual(calls,2);

  const fallbackPlan=core.plan('fallback',{capabilities:['test.fallback']});
  const fallbackResult=await core.execute(fallbackPlan);
  assert.strictEqual(fallbackResult.status,'completed');
  assert.strictEqual(fallbackResult.results[0].via,'fallback');
  assert.strictEqual(fallbackResult.results[0].value,'fallback-ok');

  const timeoutPlan=core.plan('timeout and replan',{capabilities:['test.timeout']});
  const timeoutResult=await core.execute(timeoutPlan);
  assert.strictEqual(timeoutResult.status,'failed');
  assert.strictEqual(timeoutResult.replan.reason,'step-failed');
  assert.strictEqual(timeoutResult.replan.recommendation,'requires-new-capability-or-user-action');
  assert.strictEqual(timeoutResult.replan.attempts[0].status,'timeout');

  const blockedPlan=core.plan('external write blocked',{capabilities:['test.write']});
  const blocked=await core.execute(blockedPlan);
  assert.strictEqual(blocked.status,'blocked_external');
  assert.strictEqual(blocked.approvalRequired,true);

  const approvedPlan=core.plan('external write approved',{capabilities:['test.write']});
  const approved=await core.execute(approvedPlan,{approvals:{'step-1':{approved:true,actionId:`${approvedPlan.id}:step-1`}}});
  assert.strictEqual(approved.status,'completed');
  assert.strictEqual(approved.results[0].value,'written');

  const cancelledPlan=core.plan('cancel',{capabilities:['test.read']});
  const cancelled=await core.execute(cancelledPlan,{signal:{aborted:true}});
  assert.strictEqual(cancelled.status,'cancelled');

  const allRuns=foundation.ledger.list();
  assert.ok(allRuns.length>=6,'ledger must record executions');
  assert.ok(allRuns.every(run=>run.status!=='running'),'run ledger must have no stuck running executions');
  assert.ok(allRuns.some(run=>run.status==='blocked_external'));
  assert.ok(allRuns.some(run=>run.status==='failed'));
  assert.ok(allRuns.some(run=>run.status==='completed'));
  assert.strictEqual(foundation.ledger.assertConsistent(),true);

  const snapshot=core.snapshot();
  assert.ok(snapshot.health.status==='ok'||snapshot.health.status==='degraded');
  assert.ok(snapshot.capabilities.some(item=>item.name==='test.read'));
  assert.ok(snapshot.errors.some(item=>/transient|provider-down|capability_timeout/.test(item.message)));
  assert.strictEqual(typeof core.replan.create,'function');
  assert.strictEqual(typeof core.recovery.execute,'function');

  console.log('Pink Core Intelligence contract: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
