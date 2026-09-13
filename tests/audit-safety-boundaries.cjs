'use strict';
const assert=require('node:assert/strict');
const foundationApi=require('../foundation/pink-foundation.js');
const coreApi=require('../core/pink-operating-core.js');
const companion=require('../companion/pink-companion.js');

(async()=>{
  const foundation=foundationApi.createFoundation({});
  const core=coreApi.create({foundation});
  let calls=0;
  core.capabilities.register({name:'audit.release',risk:'PRODUCTION',handler:async()=>{calls++;return {inert:true}}});
  const downgraded=core.plan('Reject risk downgrade',{steps:[{capability:'audit.release',risk:'READ_ONLY'}]});
  assert.equal((await core.execute(downgraded)).status,'blocked_external');
  assert.equal(calls,0);
  assert.equal(foundation.ledger.list().at(-1).risk,'PRODUCTION');
  const edited=core.plan('Reject plan mutation',{capabilities:['audit.release']});
  edited.steps[0].risk='REVERSIBLE';
  assert.equal((await core.execute(edited)).status,'blocked_external');
  assert.equal(calls,0);
  const approved=core.plan('Accept action-bound approval',{capabilities:['audit.release']});
  assert.equal((await core.execute(approved,{approvals:{'step-1':{approved:true,actionId:approved.id+':step-1'}}})).status,'completed');
  assert.equal(calls,1);
  core.capabilities.register({name:'audit.read',risk:'READ_ONLY',handler:async()=> 'observed'});
  assert.equal((await core.execute(core.plan('Allow safe read',{capabilities:['audit.read']}))).status,'completed');

  const permissions=new companion.PermissionSet({roots:['/approved','C:\\approved'],capabilities:['file.read','file.write']});
  for(const value of ['/approved/file.txt','/approved/sub/file.txt','C:\\approved\\file.txt']) assert.equal(permissions.inRoot(value),true,value);
  for(const value of ['/outside/file.txt','/approved-other/file.txt','/approved/../outside/file.txt','/approved/./file.txt','/approved/%2e%2e/outside','/approved/file\u0000.txt','C:\\approved\\..\\outside','//server/share/file']) assert.equal(permissions.inRoot(value),false,value);
  const transport={request:async()=>({inert:true})};
  for(const expiry of ['invalid-date','',new Date(Date.now()-1000).toISOString()]){
    assert.throws(()=>companion.attach(transport,{permissions,sessionToken:'audit-fixture',expiresAt:expiry}),/session_expired/);
  }
  companion.attach(transport,{permissions,sessionToken:'audit-fixture',expiresAt:new Date(Date.now()+60000).toISOString()});
  assert.equal((await companion.invoke('file.read',{path:'/approved/../outside'})).status,'blocked');
  assert.equal((await companion.invoke('file.write',{path:'/approved/file'})).status,'needs_approval');
  permissions.revoke('file.read');
  assert.equal((await companion.invoke('file.read',{path:'/approved/file'})).reason,'capability_not_authorized');
  companion.disconnect();
  assert.equal((await companion.invoke('file.read',{path:'/approved/file'})).reason,'companion_disconnected');
  assert.equal((await companion.invoke('shell.execute',{})).reason,'capability_unknown');
  console.log('PASS: registered risk cannot be downgraded; ledger preserves risk; Companion rejects traversal/invalid expiry and enforces revoke/disconnect. All write adapters are inert.');
})().catch(error=>{console.error(error);process.exitCode=1});
