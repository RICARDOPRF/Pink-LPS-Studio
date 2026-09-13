// Pink Phase 0 — PUBLIC runtime configuration only.
// Never place passwords, service_role keys, private API keys or private tokens in this file.
(() => {
  if (window.PinkPublicConfig) return;
  const host = String(location.hostname || '').toLowerCase();
  const environment = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)
    ? 'development'
    : host === 'ricardoprf.github.io'
      ? 'production'
      : 'preview';

  window.PinkPublicConfig = Object.freeze({
    schemaVersion: 2,
    appVersion: '11.0.0',
    environment,
    supabase: Object.freeze({
      url: 'https://membyrbgynicllzrhjsl.supabase.co',
      // Publishable browser credential (role=anon). RLS remains the security boundary.
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0',
      functions: Object.freeze({ nvidia: 'pink-nvidia', health: 'pink-health' })
    }),
    voice: Object.freeze({
      provider: 'elevenlabs',
      agentId: 'agent_0001m2brk3bxes2vwzc26rpzqww4',
      branchId: 'agtbrch_2101m2brk4sremv9s75zgjgt61q4',
      clientCdn: 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm'
    }),
    features: Object.freeze({
      pink3d: true,
      holographicUI: true,
      nvidiaFallback: true,
      browserVoiceFallback: true,
      cloudMemory: environment === 'production',
      multiAgent: true,
      pinkStudio: true,
      toolLayer: true,
      companion: true,
      autonomousEvolution: true,
      observability: true,
      enterprise: true
    })
  });

  const phaseModules = Object.freeze([
    ['observability/pink-observability.js','phase10-observability'],
    ['agents/pink-model-router.js','phase5-multi-agent'],
    ['studio/pink-studio.js','phase6-studio'],
    ['tools/pink-tool-registry.js','phase7-tools'],
    ['companion/pink-companion.js','phase8-companion'],
    ['evolution/pink-autonomous-evolution.js','phase9-evolution'],
    ['enterprise/pink-enterprise.js','phase11-enterprise'],
    ['platform/pink-platform.js','phase5-11-platform']
  ]);
  async function loadPhaseModule(src, marker){
    if(document.querySelector(`script[data-pink-platform="${marker}"]`)) return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=new URL(src,document.baseURI).href;
      script.dataset.pinkPlatform=marker;
      script.onload=resolve;
      script.onerror=()=>reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }
  async function bootExtendedPlatform(){
    try{
      for(const [src,marker] of phaseModules) await loadPhaseModule(src,marker);
      window.dispatchEvent(new CustomEvent('pinkplatform:modules-loaded',{detail:{version:'11.0.0'}}));
    }catch(error){
      console.warn('Pink extended platform degraded; legacy runtime preserved.',error);
      window.PinkEvolution?.recordIssue?.('platform-5-11-bootstrap',error?.message||error);
    }
  }
  if(document.readyState==='complete') queueMicrotask(bootExtendedPlatform);
  else window.addEventListener('load',bootExtendedPlatform,{once:true});
})();
