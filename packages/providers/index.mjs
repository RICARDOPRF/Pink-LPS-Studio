export class ProviderAdapter {
  constructor({ id, kind, invoke, health = null }) {
    if (!id || typeof invoke !== 'function') throw new TypeError('provider id and invoke required');
    this.id = id; this.kind = kind || 'generic'; this.invokeFn = invoke; this.healthFn = health;
  }
  invoke(payload, context = {}) { return this.invokeFn(payload, context); }
  health() { return typeof this.healthFn === 'function' ? this.healthFn() : Promise.resolve({ ok: true, provider: this.id, unverified: true }); }
}

export class ProviderRouter {
  constructor() { this.providers = new Map(); }
  register(adapter) { this.providers.set(adapter.id, adapter); return adapter; }
  get(id) { return this.providers.get(id) || null; }
  async invoke(id, payload, context = {}) {
    const provider = this.get(id); if (!provider) throw new Error(`provider not found: ${id}`);
    return provider.invoke(payload, context);
  }
}

export const VoiceState = Object.freeze({ IDLE:'idle', CONNECTING:'connecting', LISTENING:'listening', THINKING:'thinking', SPEAKING:'speaking', RECOVERING:'recovering', FALLBACK:'fallback', ERROR:'error' });

export function createEdgeFunctionInvoker({ url, anonKey, getAccessToken = null }) {
  return async function invoke(functionName, body) {
    if (!url || !functionName) throw new Error('edge function configuration missing');
    const token = await getAccessToken?.();
    const response = await fetch(`${url}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: { 'content-type':'application/json', apikey: anonKey || '', authorization: `Bearer ${token || anonKey || ''}` },
      body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `edge function ${functionName} failed: ${response.status}`);
    return data;
  };
}
