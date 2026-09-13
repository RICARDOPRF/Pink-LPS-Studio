import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ ok:false, error:'method_not_allowed' }), { status:405, headers:{'content-type':'application/json'} });
  }
  const started = Date.now();
  const payload = {
    ok: true,
    service: 'pink-health',
    version: '10.0.0',
    timestamp: new Date().toISOString(),
    runtime: 'supabase-edge',
    checks: {
      supabaseUrlConfigured: Boolean(Deno.env.get('SUPABASE_URL')),
      supabaseAnonConfigured: Boolean(Deno.env.get('SUPABASE_ANON_KEY')),
      nvidiaConfigured: Boolean(Deno.env.get('NVIDIA_API_KEY'))
    },
    latencyMs: Date.now() - started
  };
  return new Response(JSON.stringify(payload), { status:200, headers:{'content-type':'application/json','cache-control':'no-store'} });
});