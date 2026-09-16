'use strict';
const assert=require('node:assert');
const tools=require('../tools/pink-tool-registry.js');
(async()=>{
  const registry=new tools.ToolRegistry();
  registry.register({name:'mixed',risk:'EXTERNAL_WRITE',capabilities:['repo.read','file.write']});
  registry.attach('mixed',{invoke:async(cap)=>cap});
  const read=await registry.invoke('mixed','repo.read',{},{});
  assert.strictEqual(read.status,'completed');assert.strictEqual(read.risk,'READ_ONLY');
  const denied=await registry.invoke('mixed','file.write',{},{});
  assert.strictEqual(denied.status,'needs_approval');assert.strictEqual(denied.risk,'EXTERNAL_WRITE');
  const write=await registry.invoke('mixed','file.write',{}, {approved:true});
  assert.strictEqual(write.status,'completed');
  console.log('Pink tool capability risk contract: OK');
})().catch(e=>{console.error(e);process.exit(1)});
