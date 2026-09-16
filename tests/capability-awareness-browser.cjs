'use strict';
const assert=require('node:assert');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=4174,baseUrl=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['tests/static-server.cjs'],{stdio:['ignore','pipe','inherit'],env:{...process.env,PINK_TEST_PORT:String(port)}});
function waitForServer(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Pink V15 test server timeout')),8000);server.stdout.on('data',c=>{if(String(c).includes('Pink test server')){clearTimeout(timer);resolve()}});server.once('exit',code=>{clearTimeout(timer);if(code!==null&&code!==0)reject(new Error(`Pink V15 test server exited ${code}`))})})}
function unwrap(value){let x=value;for(let i=0;i<8&&x&&typeof x==='object'&&x.status==='completed'&&Object.prototype.hasOwnProperty.call(x,'result');i++)x=x.result;return x}
(async()=>{
  await waitForServer();
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:768}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e?.message||e)));
    await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>Boolean(window.PinkCapabilityAwareness&&window.PinkTools&&window.PinkIntentRouter&&window.PinkAgentHarness),null,{timeout:15000});
    const result=await page.evaluate(async()=>{
      const snap=window.PinkCapabilityAwareness.snapshot();
      const cameraPlan=window.PinkIntentRouter.plan('Pink, você consegue abrir a câmera?');
      const imperativePlan=window.PinkIntentRouter.plan('Pink, abre a câmera');
      const capabilityResult=await window.PinkIntentRouter.execute(cameraPlan);
      const webAnswer=window.PinkCapabilityAwareness.answer('Você tem acesso à internet?');
      const manifest=window.PinkCapabilityAwareness.manifest('internet');
      return {snap,cameraPlan,imperativePlan,capabilityResult,webAnswer,manifest,tool:window.PinkTools.registry.get('runtime-capabilities')};
    });
    assert.strictEqual(result.cameraPlan.intent,'capability_query');
    assert.strictEqual(result.cameraPlan.steps[0].tool,'runtime-capabilities');
    assert.strictEqual(result.capabilityResult.status,'completed');
    const direct=unwrap(result.capabilityResult.results?.[0]?.result);
    assert.match(String(direct?.reply||''),/câmera/i);
    assert.strictEqual(result.imperativePlan.intent,'camera');
    assert.ok(result.snap.available.includes('runtime-clock'));
    assert.ok(result.snap.available.includes('camera'));
    assert.match(result.webAnswer.reply,/^Sim\./);
    assert.match(result.manifest,/web-research/);
    assert.strictEqual(result.tool.health,'healthy');
    assert.deepStrictEqual(errors.filter(x=>!/ResizeObserver loop/i.test(x)),[]);
    console.log('Pink V15 browser capability awareness: OK');
  } finally {await browser.close();server.kill('SIGTERM')}
})().catch(e=>{server.kill('SIGTERM');console.error(e);process.exit(1)});
