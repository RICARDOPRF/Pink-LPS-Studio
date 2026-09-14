// Pink Phase 0 — PUBLIC runtime configuration only.
// Never place passwords, service_role keys, private API keys or private tokens in this file.
(() => {
  if (window.PinkPublicConfig) return;
  const host=String(location.hostname||'').toLowerCase();
  const environment=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)?'development':host==='ricardoprf.github.io'?'production':'preview';
  window.PinkPublicConfig=Object.freeze({schemaVersion:2,appVersion:'12.4.0',environment,
    supabase:Object.freeze({url:'https://membyrbgynicllzrhjsl.supabase.co',anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0',functions:Object.freeze({openai:'pink-openai',nvidia:'pink-nvidia',geminiToken:'pink-gemini-token',geminiReasoning:'pink-gemini-reasoning',vision:'pink-vision',health:'pink-health'})}),
    voice:Object.freeze({provider:'gemini-live',model:'models/gemini-3.1-flash-live-preview',voiceName:'Aoede',nvidiaFallback:true}),
    ai:Object.freeze({supervisor:'chatgpt',fallbacks:Object.freeze(['gemini-reasoning','nvidia-nemotron']),memory:'pink-memory-cloud'}),
    vision:Object.freeze({provider:'gemini-3-flash-preview',mode:'opt-in',capture:'on-demand',biometricIdentity:false}),
    nvidia:Object.freeze({primaryReasoning:'nvidia/nemotron-3.5-30b-a3b',capabilities:Object.freeze({rag:'rag-blueprint',research:'aiq-research',optimization:'cuopt',dataframeGpu:'cudf',visionPipeline:'deepstream'})}),
    governance:Object.freeze({autonomyLevels:true,defaultAutonomyLevel:2,policy:'AUTONOMY_ENVELOPE_PLUS_APPROVAL_GATE',engineeringLoop:true,engineeringPolicy:'LAB_FIRST_NO_SELF_PUBLISH'}),
    features:Object.freeze({pink3d:true,holographicUI:true,geminiLive:true,pinkVision:true,nvidiaFallback:true,browserVoiceFallback:false,cloudMemory:environment==='production',multiAgent:true,pinkStudio:true,toolLayer:true,companion:true,autonomousEvolution:true,autonomyConsole:true,engineeringEvolution:true,observability:true,enterprise:true})});
  if(typeof document==='undefined')return;
  const phaseModules=Object.freeze([['governance/pink-autonomy-console.js','governance-autonomy'],['observability/pink-observability.js','phase10-observability'],['agents/pink-openai.js','chatgpt-supervisor'],['agents/pink-model-router.js','phase5-multi-agent'],['agents/pink-unified-ai-gateway.js','unified-ai-gateway'],['core/pink-intent-context-router.js','intent-context-router'],['vision/pink-vision.js','pink-vision'],['studio/pink-studio.js','phase6-studio'],['tools/pink-tool-registry.js','phase7-tools'],['companion/pink-companion.js','phase8-companion'],['evolution/pink-autonomous-evolution.js','phase9-evolution'],['evolution/pink-engineering-loop.js','engineering-evolution-loop'],['enterprise/pink-enterprise.js','phase11-enterprise'],['platform/pink-platform.js','phase5-11-platform']]);
  async function loadPhaseModule(src,marker){if(document.querySelector(`script[data-pink-platform="${marker}"]`))return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(src,document.baseURI).href;script.dataset.pinkPlatform=marker;script.onload=resolve;script.onerror=()=>reject(new Error(`Failed to load ${src}`));document.head.appendChild(script)})}
  async function bootExtendedPlatform(){try{for(const [src,marker] of phaseModules)await loadPhaseModule(src,marker);window.dispatchEvent(new CustomEvent('pinkplatform:modules-loaded',{detail:{version:'12.4.0'}}))}catch(error){console.warn('Pink extended platform degraded; stable runtime preserved.',error);window.PinkEvolution?.recordIssue?.('platform-bootstrap',error?.message||error)}}
  if(document.readyState==='complete')queueMicrotask(bootExtendedPlatform);else window.addEventListener('load',bootExtendedPlatform,{once:true});
})();
