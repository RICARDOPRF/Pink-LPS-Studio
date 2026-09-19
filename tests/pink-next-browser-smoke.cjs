'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium,devices}=require('playwright');
const port=Number(process.env.PINK_TEST_PORT||4174),baseUrl=`http://127.0.0.1:${port}/apps/next/index.html`;
const server=spawn(process.execPath,['tests/static-server.cjs'],{stdio:['ignore','pipe','inherit'],env:{...process.env,PINK_TEST_PORT:String(port)}});
function waitForServer(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Pink Next test server timeout')),8000);server.stdout.on('data',c=>{if(String(c).includes('Pink test server')){clearTimeout(timer);resolve()}});server.once('exit',code=>{clearTimeout(timer);if(code!==null&&code!==0)reject(new Error(`server exited ${code}`))})})}
async function smoke(browser,name,options){
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e?.message||e)));
  await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>Boolean(window.PinkNext?.snapshot),null,{timeout:10000});
  const runtime=await page.evaluate(()=>window.PinkNext.snapshot());
  assert.equal(runtime.version,'next-0.13.0',`${name}: Pink Next runtime version mismatch`);
  assert.ok(runtime.projectBrains?.adapters?.includes('graphiti'),`${name}: Project Brain Graphiti adapter missing`);
  assert.ok(runtime.modelLab?.adapters?.includes('minimind'),`${name}: Training Studio MiniMind adapter missing`);
  assert.ok(runtime.agentLearning?.adapters?.includes('agent-lightning'),`${name}: Agent Learning Agent Lightning adapter missing`);
  assert.ok(runtime.os?.apps?.some((app)=>app.id==='mission-control'),`${name}: Pink OS Mission Control registry missing`);
  assert.ok(runtime.spatial?.targets?.some((x)=>x.id==='agent-mesh'),`${name}: spatial targets missing`);
  await page.click('#spatial-toggle');
  await page.waitForSelector('#spatial-stage:not([hidden])');
  const spatialNodes=await page.locator('.spatial-node').count();
  assert.ok(spatialNodes>=6,`${name}: spatial mission control nodes missing`);
  assert.ok(await page.locator('#spatial-task-count').isVisible(),`${name}: spatial live HUD missing`);
  const beforeQuality=await page.evaluate(()=>window.PinkNext.spatial.snapshot().quality);
  await page.click('#spatial-quality');
  const afterQuality=await page.evaluate(()=>window.PinkNext.spatial.snapshot().quality);
  assert.notEqual(afterQuality,beforeQuality,`${name}: spatial quality control did not change kernel`);
  assert.ok(await page.locator('#spatial-camera').isVisible(),`${name}: spatial camera control missing`);
  assert.equal(await page.locator('#spatial-camera').getAttribute('aria-pressed'),'false',`${name}: camera must be opt-in`);
  const links=await page.locator('.spatial-link').count();
  assert.ok(links>=6,`${name}: spatial network links missing`);
  assert.ok(runtime.satellite&&runtime.satellite.endpoint.includes('127.0.0.1'),`${name}: Satellite client missing`);
  assert.match(await page.title(),/Pink LPS Studio Next/i);
  assert.ok(await page.locator('#pink-stage').isVisible(),`${name}: Pink stage hidden`);
  assert.ok(await page.locator('#prompt').isVisible(),`${name}: composer hidden`);
  assert.ok(await page.locator('#attach-file').isVisible(),`${name}: attachment action hidden`);
  assert.equal(await page.locator('#file-input').getAttribute('multiple'),'');
  let overflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2);assert.equal(overflow,true,`${name}: horizontal overflow`);
  await page.locator('#prompt').fill('Pesquise na web e valide evidências do projeto Pink');
  await page.locator('#send').click();
  await page.waitForFunction(()=>window.PinkNext.taskRuntime.list().length>=1);
  const task=await page.evaluate(()=>window.PinkNext.taskRuntime.list().at(-1));
  assert.equal(task.status,'running');assert.ok(task.plan.length>=3);
  const constraint=await page.evaluate(()=>window.PinkNext.security.constraints.evaluate('deploy to production'));
  assert.equal(constraint.allowed,false);
  const capabilities=await page.evaluate(()=>window.PinkNext.tools.list());
  assert.ok(capabilities.some(x=>x.id==='ai.nvidia'));
  assert.ok(capabilities.some(x=>x.id==='memory.cloud'));

  await page.locator('[data-view="satellite"]').click();
  assert.ok(await page.getByText('Pink Satellite Windows',{exact:true}).isVisible(),`${name}: Satellite panel hidden`);
  assert.ok(await page.locator('#sat-probe').isVisible(),`${name}: Satellite detect action missing`);
  assert.ok(await page.locator('#sat-pair-code').isVisible(),`${name}: Satellite pairing input missing`);
  assert.equal(await page.locator('#sat-system').isDisabled(),true,`${name}: local action must be disabled before pairing`);
  overflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2);assert.equal(overflow,true,`${name}: Satellite view horizontal overflow`);

  await page.locator('[data-view="home"]').click();
  if(name==='desktop'){
    await page.locator('#mode-toggle').click();assert.equal(await page.locator('.app-shell').getAttribute('data-mode'),'pink-only');
    assert.equal(await page.locator('.inspector').isVisible(),false);await page.locator('#mode-toggle').click();
  }
  const fatal=errors.filter(e=>!/ResizeObserver loop/i.test(e));assert.deepEqual(fatal,[],`${name}: ${fatal.join(' | ')}`);
  console.log(`Pink Next browser smoke ${name}: PASS`);await context.close();
}
(async()=>{await waitForServer();const browser=await chromium.launch({headless:true});try{await smoke(browser,'desktop',{viewport:{width:1440,height:900}});await smoke(browser,'mobile',{...devices['iPhone 14']})}finally{await browser.close();server.kill('SIGTERM')}})().catch(e=>{server.kill('SIGTERM');console.error(e);process.exit(1)});
