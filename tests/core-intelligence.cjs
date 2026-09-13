'use strict';
const assert=require('node:assert');
const foundationApi=require('../foundation/pink-foundation.js');
const coreApi=require('../core/pink-operating-core.js');
(async()=>{
 const config={schemaVersion:2,appVersion:'12.1.0',environment:'development',supabase:{url:'https://membyrbgynicllzrhjsl.supabase.co',anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0'},voice:{provider:'gemini-live',model:'models/gemini-3.1-flash-live-preview',voiceName:'Aoede'},features:{pink3d:true}};
 const foundation=foundationApi.createFoundation(config);assert.strictEqual(foundation.health().ok,true);const core=coreApi.create({foundation});
 assert.strictEqual(core.version,'1.0.0');assert.strictEqual(core.awareness.snapshot().currentAgent,'chatgpt-supervisor');
 core.context.setActive({type:'dashboard',project:'forno-panela'});assert.strictEqual(core.context.snapshot().active.project,'forno-panela');
 assert.throws(()=>core.tasks.transition('missing','running'),/unknown_task/);const st=core.tasks.create({id:'state-task',title:'state'});assert.strictEqual(st.status,'pending');core.tasks.transition('state-task','running');assert.throws(()=>core.tasks.transition('state-task','pending'),/invalid_task_transition/);core.tasks.transition('state-task','completed');
 let calls=0;core.capabilities.register({name:'test.read',risk:'READ_ONLY',timeoutMs:200,maxRetries:0,handler:async input=>({echo:input.value})});
 let plan=core.plan('read test',{steps:[{capability:'test.read',input:{value:42}}]});let out=await core.execute(plan);assert.strictEqual(out.status,'completed');assert.strictEqual(out.results[0].value.echo,42);
 core.capabilities.register({name:'test.retry',risk:'READ_ONLY',timeoutMs:200,maxRetries:1,handler:async()=>{calls++;if(calls===1)throw new Error('transient');return {ok:true}}});plan=core.plan('retry test',{capabilities:['test.retry']});out=await core.execute(plan);assert.strictEqual(out.status,'completed');assert.strictEqual(calls,2);
 core.capabilities.register({name:'test.write',risk:'EXTERNAL_WRITE',timeoutMs:200,maxRetries:0,handler:async()=>({ok:true})});plan=core.plan('write test',{capabilities:['test.write']});out=await core.execute(plan);assert.strictEqual(out.status,'blocked_external');assert.strictEqual(out.approvalRequired,true);
 core.capabilities.register({name:'test.timeout',risk:'READ_ONLY',timeoutMs:50,maxRetries:0,handler:async()=>new Promise(r=>setTimeout(()=>r({ok:true}),120))});plan=core.plan('timeout test',{capabilities:['test.timeout']});out=await core.execute(plan);assert.strictEqual(out.status,'failed');
 const invalid=core.plan('missing test',{capabilities:['missing.capability']});assert.strictEqual(invalid.valid,false);assert.throws(()=>core.capabilities.register({name:'test.bad',handler:null}),/capability_handler_required/);
 assert.strictEqual(core.tasks.list().some(t=>t.status==='running'),false);console.log('Pink Core Intelligence contract: OK');
})().catch(e=>{console.error(e);process.exit(1)});
