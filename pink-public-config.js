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
    schemaVersion: 1,
    appVersion: '10.1.0',
    environment,
    supabase: Object.freeze({
      url: 'https://membyrbgynicllzrhjsl.supabase.co',
      // Publishable browser credential (role=anon). RLS remains the security boundary.
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0',
      functions: Object.freeze({ nvidia: 'pink-nvidia' })
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
      cloudMemory: false,
      multiAgent: false,
      companion: false,
      autonomousEvolution: false
    })
  });
})();
