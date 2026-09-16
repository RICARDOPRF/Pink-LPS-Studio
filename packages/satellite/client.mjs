const DEFAULT_ENDPOINT = 'http://127.0.0.1:8777';

function withTimeout(ms = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('satellite_timeout')), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function parseJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `satellite_http_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export class PinkSatelliteClient {
  constructor({ endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
    this.endpoint = String(endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.storage = storage;
    this.device = null;
    this.lastError = null;
    this.sessionToken = this.storage?.getItem?.('pink.next.satellite.session') || null;
  }

  snapshot() {
    return {
      endpoint: this.endpoint,
      paired: Boolean(this.sessionToken && this.device),
      device: this.device,
      lastError: this.lastError ? String(this.lastError.message || this.lastError) : null,
    };
  }

  async #request(path, { method = 'GET', body = null, auth = false, approvalToken = null, timeoutMs = 3500 } = {}) {
    if (!this.fetchImpl) throw new Error('fetch_unavailable');
    const timer = withTimeout(timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (body !== null) headers['Content-Type'] = 'application/json';
      if (auth) {
        if (!this.sessionToken) throw new Error('satellite_not_paired');
        headers.Authorization = `Bearer ${this.sessionToken}`;
      }
      if (approvalToken) headers['X-Pink-Approval'] = approvalToken;
      const response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: timer.signal,
        cache: 'no-store',
      });
      const payload = await parseJson(response);
      this.lastError = null;
      return payload;
    } catch (error) {
      this.lastError = error;
      throw error;
    } finally {
      timer.done();
    }
  }

  async probe() {
    return this.#request('/v1/info');
  }

  async restore() {
    if (!this.sessionToken) return null;
    try {
      const payload = await this.#request('/v1/session', { auth: true });
      this.device = payload.device || null;
      return this.device;
    } catch (error) {
      this.disconnect();
      return null;
    }
  }

  async pair(code) {
    const payload = await this.#request('/v1/pair', { method: 'POST', body: { code: String(code || '').trim() } });
    if (!payload?.sessionToken) throw new Error('satellite_pair_failed');
    this.sessionToken = payload.sessionToken;
    this.device = payload.device || null;
    this.storage?.setItem?.('pink.next.satellite.session', this.sessionToken);
    return this.device;
  }

  disconnect() {
    this.sessionToken = null;
    this.device = null;
    this.storage?.removeItem?.('pink.next.satellite.session');
  }

  async requestApproval(capability) {
    return this.#request('/v1/approval/request', { method: 'POST', auth: true, body: { capability } });
  }

  async confirmApproval(approvalId, code) {
    return this.#request('/v1/approval/confirm', { method: 'POST', auth: true, body: { approvalId, code: String(code || '').trim() } });
  }

  async invoke(capability, args = {}, { approvalToken = null, timeoutMs = 10_000 } = {}) {
    return this.#request('/v1/invoke', { method: 'POST', auth: true, approvalToken, timeoutMs, body: { capability, args } });
  }
}

export { DEFAULT_ENDPOINT as PINK_SATELLITE_DEFAULT_ENDPOINT };
