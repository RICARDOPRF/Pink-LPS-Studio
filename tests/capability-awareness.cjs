'use strict';
const assert=require('node:assert');
const fs=require('node:fs');

const mockTools=[
  {name:'camera',health:'healthy',auth:'browser-permission',risk:'READ_ONLY',capabilities:['camera.open','camera.close','camera.status','camera.observe'],read:true,write:false},
  {name:'runtime-clock',health:'healthy',auth:'device',risk:'READ_ONLY',capabilities:['time.current','date.current'],read:true,write:false},
  {name:'github',health:'unknown',auth:'connector',risk:'EXTERNAL_WRITE',capabilities:['repo.read','file.write'],read:true,write:true},
  {name:'runtime-capabilities',health:'healthy',auth:'runtime',risk:'READ_ONLY',capabilities:['capability.query','capability.snapshot'],read:true,write:false}
];
globalThis.PinkTools={registry:{list:()=>mockTools}};
globalThis.PinkPublicConfig={supabase:{url:'https://example.supabase.co',anonKey:'SHOULD_NEVER_APPEAR',functions:{geminiReasoning:'pink-gemini-reasoning'}}};
globalThis.PinkGeminiResearch={search:async()=>({})};
globalThis.PinkMemoryCloud={recall:async()=>[],remember:async()=>({})};
globalThis.PinkVision={ask:async()=>({})};
globalThis.PinkSupervisorVoice={askBrain:async()=>({})};

const awareness=require('../runtime/pink-capability-awareness.js');
assert.strictEqual(awareness.version,'15.0.0');

const camera=awareness.answer('Você consegue abrir a câmera?');
assert.strictEqual(camera.status,'completed');
assert.match(camera.reply,/^Sim\./);
assert.match(camera.reply,/câmera/i);
assert.ok(camera.matches.some(x=>x.id==='camera'&&x.status==='available'));

const web=awareness.answer('Você tem acesso à internet?');
assert.match(web.reply,/^Sim\./);
assert.ok(web.matches.some(x=>x.id==='web-research'&&x.status==='available'));

const github=awareness.answer('Você consegue acessar o GitHub?');
assert.match(github.reply,/não posso afirmar que sim/i);
assert.ok(github.matches.some(x=>x.id==='github'&&x.status==='registered'));

const manifest=awareness.manifest('pesquise na internet', {limit:4});
assert.match(manifest,/MANIFESTO DE CAPACIDADES DO RUNTIME/);
assert.match(manifest,/web-research/);
assert.doesNotMatch(manifest,/SHOULD_NEVER_APPEAR/);
assert.match(manifest,/não invente acesso/i);

const toolRegistry=require('../tools/pink-tool-registry.js');
const capabilityTool=toolRegistry.registry.get('runtime-capabilities');
assert.ok(capabilityTool,'runtime-capabilities tool must be registered');
assert.deepStrictEqual(capabilityTool.capabilities,['capability.query','capability.snapshot']);
assert.strictEqual(toolRegistry.capabilityRisk(capabilityTool,'capability.query'),'READ_ONLY');

globalThis.PinkCapabilityAwareness=awareness;
globalThis.PinkCameraRouter={classify:()=>null};
const intent=require('../core/pink-intent-context-router.js');
let plan=intent.plan('Pink, você consegue abrir a câmera?');
assert.strictEqual(plan.intent,'capability_query');
assert.strictEqual(plan.steps[0].tool,'runtime-capabilities');
assert.strictEqual(plan.steps[0].capability,'capability.query');
plan=intent.plan('Pink, abre a câmera');
assert.notStrictEqual(plan.intent,'capability_query','imperative camera command must not be downgraded to introspection');

const supervisor=fs.readFileSync('runtime/pink-supervisor-voice.js','utf8');
assert.match(supervisor,/function capabilityContext\(/);
assert.match(supervisor,/PinkCapabilityAwareness\?\.manifest/);
assert.match(supervisor,/plan\.intent==='capability_query'/);

const config=fs.readFileSync('pink-public-config.js','utf8');
assert.match(config,/runtime\/pink-capability-awareness\.js/);
assert.match(config,/capabilityAwareness:true/);

console.log('Pink V15 capability awareness contract: OK');
