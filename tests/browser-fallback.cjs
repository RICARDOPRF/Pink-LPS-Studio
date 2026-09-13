// Real Chromium fallback smoke test. Requires Playwright + its Chromium browser.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json'};
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},reducedMotion:'reduce',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
   // Deliberately exercise CDN/offline fallback; never start provider sessions in CI.
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.Pink3DPresence?.snapshot().fallback===true);
   await page.waitForFunction(()=>document.querySelector('.portrait').complete&&document.querySelector('.portrait').naturalWidth>0);
   const status=await page.evaluate(()=>({presence:Pink3DPresence.snapshot(),avatar:Pink3DPresence.avatarSnapshot(),portrait:getComputedStyle(document.querySelector('.portrait')).visibility,portraitLoaded:document.querySelector('.portrait').naturalWidth>0,ringAnimation:getComputedStyle(document.querySelector('.pink-3d-fallback-ring')).animationName,core:!!window.PinkCore,voice:!!window.PinkVoice,nvidia:!!window.PinkNVIDIA}));
   assert.equal(status.portrait,'visible');assert.equal(status.portraitLoaded,true);assert.equal(status.ringAnimation,'none');assert.equal(status.avatar.hasModel,false);assert.equal(status.core,true);assert.equal(status.voice,true);assert.equal(status.nvidia,true);
   assert.equal(requests.some(url=>/\.glb(?:$|\?)/i.test(url)||url.includes('GLTFLoader')),false);
   await page.locator('#wakeSettingsBtn').click();await page.locator('#settingsDialog').waitFor({state:'visible'});await page.locator('#settingsDialog button[type="submit"]').click();
   await page.evaluate(()=>{document.querySelector('#pinkStage').dataset.state='reviewing'});await page.waitForFunction(()=>Pink3DPresence.snapshot().state==='reviewing');
   await page.evaluate(()=>Pink3DPresence.destroy());assert.equal(await page.locator('.pink-3d-fallback-ring').count(),0);assert.equal(await page.locator('.pink-3d-presence-canvas').count(),0);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport:mobile?'390x844':'1440x900',status:'PASS',checks:['real ESM boot','CDN failure fallback','portrait element retained','reduced motion','core and voice exports','no model download','settings open/close','state observation','destroy','no uncaught JS errors']}));
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
