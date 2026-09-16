import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const REASONING_MODEL = "gemini-3-flash-preview";
const SEARCH_MODEL = "gemini-3.6-flash";
const ALLOWED_ORIGINS = new Set([
  "https://ricardoprf.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ricardoprf.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function extractText(data: any) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const out: string[] = [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) if (typeof part?.text === "string") out.push(part.text);
  }
  return out.join("\n").trim();
}
function extractGrounding(data: any) {
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const metadata = candidate?.groundingMetadata || candidate?.grounding_metadata || null;
  const chunks = metadata?.groundingChunks || metadata?.grounding_chunks || [];
  const queries = metadata?.webSearchQueries || metadata?.web_search_queries || [];
  const seen = new Set<string>();
  const sources: Array<{title: string; url: string}> = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    const url = String(web?.uri || web?.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: String(web?.title || new URL(url).hostname).slice(0, 240), url });
  }
  return { sources: sources.slice(0, 12), queries: Array.isArray(queries) ? queries.slice(0, 12) : [] };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { ok: false, error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json(origin, 503, { ok: false, error: "gemini_not_configured" });

  let body: any;
  try { body = await req.json(); } catch { return json(origin, 400, { ok: false, error: "invalid_json" }); }
  const input = String(body?.input ?? body?.prompt ?? "").trim();
  if (!input) return json(origin, 400, { ok: false, error: "input_required" });
  const search = body?.search === true;
  const model = search ? SEARCH_MODEL : REASONING_MODEL;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const payload: any = {
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      temperature: typeof body?.temperature === "number" ? Math.min(Math.max(body.temperature, 0), 2) : search ? 0.2 : 0.4,
      topP: typeof body?.topP === "number" ? Math.min(Math.max(body.topP, 0.05), 1) : 0.95,
      maxOutputTokens: typeof body?.maxOutputTokens === "number" ? Math.min(Math.max(Math.floor(body.maxOutputTokens), 64), 8192) : 1800,
    },
  };
  if (search) payload.tools = [{ google_search: {} }];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }

    if (!response.ok) {
      return json(origin, 502, {
        ok: false,
        error: search ? "gemini_google_search_failed" : "gemini_generate_content_failed",
        status: response.status,
        providerStatus: data?.error?.status || null,
        providerMessage: typeof data?.error?.message === "string" ? data.error.message.slice(0, 500) : null,
      });
    }

    const output = extractText(data);
    if (!output) return json(origin, 502, { ok: false, error: "gemini_empty_output" });
    const grounding = search ? extractGrounding(data) : { sources: [], queries: [] };

    return json(origin, 200, {
      ok: true,
      provider: search ? "gemini-google-search" : "gemini",
      model,
      output,
      reply: output,
      grounded: search && grounding.sources.length > 0,
      sources: grounding.sources,
      queries: grounding.queries,
      usage: data?.usageMetadata || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(origin, 502, { ok: false, error: "gemini_reasoning_broker_failed", detail: message.slice(0, 300) });
  }
});
