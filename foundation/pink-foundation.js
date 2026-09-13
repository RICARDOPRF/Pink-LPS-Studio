// Pink Phase 0 — Foundation & Safety primitives.
// Browser-safe, dependency-free, and intentionally incapable of arbitrary code execution.
(function (root, factory) {
  const createFoundation = factory();
  const api = createFoundation(root?.PinkPublicConfig || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PinkFoundation = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const RISK = Object.freeze({
    READ_ONLY: 'READ_ONLY',
    REVERSIBLE: 'REVERSIBLE',
    EXTERNAL_WRITE: 'EXTERNAL_WRITE',
    DESTRUCTIVE: 'DESTRUCTIVE',
    PRODUCTION: 'PRODUCTION'
  });
  const RISK_ORDER = Object.freeze({ READ_ONLY: 0, REVERSIBLE: 1, EXTERNAL_WRITE: 2, DESTRUCTIVE: 3, PRODUCTION: 4 });
  const TERMINAL = Object.freeze(['completed', 'failed', 'cancelled', 'timeout', 'blocked_external']);
  const ENVIRONMENTS = Object.freeze(['development', 'preview', 'production']);
  const VOICE_PROVIDERS = Object.freeze(['gemini-live', 'browser', 'local']);

  function decodeJwtPayload(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return null;
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const raw = typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  function validateConfig(config) {
    const errors = [];
    const warnings = [];
    const cfg = config && typeof config === 'object' ? config : {};
    if (![1, 2].includes(Number(cfg.schemaVersion))) errors.push('schemaVersion must equal 1 or 2');
    if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(String(cfg.appVersion || ''))) errors.push('appVersion must be semver-like');
    if (!ENVIRONMENTS.includes(cfg.environment)) errors.push('environment must be development, preview or production');

    const supabase = cfg.supabase || {};
    try {
      const url = new URL(String(supabase.url || ''));
      if (url.protocol !== 'https:') errors.push('supabase.url must use HTTPS');
      if (!url.hostname.endsWith('.supabase.co')) warnings.push('supabase.url is not a *.supabase.co host');
    } catch (_) { errors.push('supabase.url is invalid'); }

    const payload = decodeJwtPayload(supabase.anonKey);
    if (!payload) errors.push('supabase.anonKey must be a valid JWT publishable credential');
    else if (payload.role !== 'anon') errors.push(`browser Supabase key role must be anon, received ${String(payload.role || 'unknown')}`);

    const voice = cfg.voice || {};
    const provider = String(voice.provider || '');
    if (!VOICE_PROVIDERS.includes(provider)) errors.push(`voice.provider is invalid: ${provider || 'missing'}`);
    if (provider === 'gemini-live') {
      if (!/^models\/[a-z0-9._-]+$/i.test(String(voice.model || ''))) errors.push('voice.model is invalid for Gemini Live');
      if (!/^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(String(voice.voiceName || ''))) errors.push('voice.voiceName is invalid');
    }
    if (provider === 'browser' && voice.clientCdn) warnings.push('browser voice should not require a remote client CDN');

    for (const [name, value] of Object.entries(cfg.features || {})) {
      if (typeof value !== 'boolean') errors.push(`feature flag ${name} must be boolean`);
    }
    return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
  }

  function normalizeRisk(value) {
    const risk = String(value || RISK.READ_ONLY).toUpperCase();
    if (!(risk in RISK_ORDER)) throw new Error(`Unknown Pink risk class: ${risk}`);
    return risk;
  }

  function requiresApproval(risk) {
    return RISK_ORDER[normalizeRisk(risk)] >= RISK_ORDER.EXTERNAL_WRITE;
  }

  class ApprovalEngine {
    constructor(options = {}) { this.productionAlwaysRequiresApproval = options.productionAlwaysRequiresApproval !== false; }
    assess(action = {}) {
      const risk = normalizeRisk(action.risk);
      const approvalRequired = requiresApproval(risk) || (this.productionAlwaysRequiresApproval && risk === RISK.PRODUCTION);
      return Object.freeze({ risk, approvalRequired, reversible: risk === RISK.REVERSIBLE, destructive: risk === RISK.DESTRUCTIVE, production: risk === RISK.PRODUCTION });
    }
    canExecute(action = {}, approval = null) {
      const assessment = this.assess(action);
      if (!assessment.approvalRequired) return Object.freeze({ allowed: true, assessment, reason: 'risk-does-not-require-approval' });
      const valid = Boolean(approval && approval.approved === true && approval.actionId && approval.actionId === action.id);
      return Object.freeze({ allowed: valid, assessment, reason: valid ? 'explicit-approval' : 'approval-required' });
    }
  }

  class RunLedger {
    constructor({ now = () => Date.now(), maxEntries = 500 } = {}) { this.now = now; this.maxEntries = Math.max(20, Number(maxEntries) || 500); this.runs = new Map(); this.order = []; this.sequence = 0; }
    start(input = {}) {
      const id = String(input.id || `pink-run-${this.now()}-${++this.sequence}`);
      if (this.runs.has(id)) throw new Error(`Duplicate run id: ${id}`);
      const run = { id, phase: input.phase || null, task: String(input.task || ''), risk: normalizeRisk(input.risk || RISK.READ_ONLY), status: 'running', startedAt: this.now(), finishedAt: null, error: null, evidence: [], metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {} };
      this.runs.set(id, run); this.order.push(id); while (this.order.length > this.maxEntries) this.runs.delete(this.order.shift()); return this.get(id);
    }
    addEvidence(id, evidence) { const run = this.runs.get(String(id)); if (!run) throw new Error(`Unknown run: ${id}`); if (run.status !== 'running') throw new Error(`Cannot mutate terminal run: ${id}`); const entry = typeof evidence === 'string' ? { type: 'note', value: evidence } : { ...(evidence || {}) }; run.evidence.push({ ...entry, at: this.now() }); return this.get(id); }
    finish(id, status, detail = {}) { const run = this.runs.get(String(id)); if (!run) throw new Error(`Unknown run: ${id}`); if (run.status !== 'running') throw new Error(`Run already terminal: ${id}`); const next = String(status || ''); if (!TERMINAL.includes(next)) throw new Error(`Invalid terminal status: ${next}`); run.status = next; run.finishedAt = this.now(); run.error = detail.error ? String(detail.error) : null; if (detail.evidence) run.evidence.push({ type: 'terminal', value: detail.evidence, at: this.now() }); return this.get(id); }
    timeoutStale(maxAgeMs) { const age = Math.max(1, Number(maxAgeMs) || 1), now = this.now(), timedOut = []; for (const id of this.order) { const run = this.runs.get(id); if (run?.status === 'running' && now - run.startedAt >= age) { this.finish(id, 'timeout', { error: 'run exceeded timeout budget' }); timedOut.push(id); } } return timedOut; }
    get(id) { const run = this.runs.get(String(id)); return run ? JSON.parse(JSON.stringify(run)) : null; }
    list() { return this.order.map(id => this.get(id)).filter(Boolean); }
    assertConsistent() { for (const run of this.runs.values()) { if (run.status === 'running' && run.finishedAt !== null) return false; if (TERMINAL.includes(run.status) && !Number.isFinite(run.finishedAt)) return false; if (run.status !== 'running' && !TERMINAL.includes(run.status)) return false; } return true; }
  }

  function redactSecrets(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return String(text || '')
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_API_KEY]')
      .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED_GOOGLE_API_KEY]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  }

  function createFoundation(config) {
    const validation = validateConfig(config), approval = new ApprovalEngine(), ledger = new RunLedger();
    return Object.freeze({ version: '0.2.0', config, validation, risk: RISK, terminalStatuses: TERMINAL, validateConfig, normalizeRisk, requiresApproval, approval, ledger, ApprovalEngine, RunLedger, redactSecrets, decodeJwtPayload, createFoundation, health: () => ({ ok: validation.ok && ledger.assertConsistent(), environment: config?.environment || null, config: validation, ledgerConsistent: ledger.assertConsistent() }) });
  }

  return createFoundation;
});
