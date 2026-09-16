import { RiskLevel, makeId } from '../contracts/index.mjs';

const DEFAULT_CONSTRAINTS = Object.freeze([
  { id: 'no-main-merge', pattern: /merge.+\bmain\b/i, decision: 'deny', reason: 'main merge requires explicit human approval' },
  { id: 'no-prod-publish', pattern: /(publish|deploy).+(production|prod)/i, decision: 'deny', reason: 'production publication requires explicit human approval' },
  { id: 'no-secret-exposure', pattern: /(print|show|log|expose).+(api.?key|secret|password|token)/i, decision: 'deny', reason: 'secrets must not be exposed' },
  { id: 'no-auth-weakening', pattern: /(disable|bypass|weaken).+(auth|rls|security|jwt)/i, decision: 'deny', reason: 'security controls may not be weakened' },
  { id: 'no-prod-delete', pattern: /(delete|drop|truncate).+(production|prod|database|table)/i, decision: 'deny', reason: 'production data deletion is blocked' }
]);

export class ConstraintRegister {
  constructor(constraints = DEFAULT_CONSTRAINTS) { this.constraints = [...constraints]; }
  evaluate(actionText) {
    const text = String(actionText || '');
    const hits = this.constraints.filter((c) => c.pattern.test(text));
    return { allowed: !hits.some((h) => h.decision === 'deny'), hits };
  }
}

export class ApprovalBroker {
  #tokens = new Map();
  issue({ capability, risk = RiskLevel.LOW, scope = {}, ttlMs = 10 * 60_000, approvedBy = 'Paulo Ricardo' }) {
    if (risk < RiskLevel.MEDIUM) return null;
    const id = makeId('approval');
    const token = { id, capability, risk, scope, approvedBy, createdAt: Date.now(), expiresAt: Date.now() + ttlMs, used: false };
    this.#tokens.set(id, token);
    return Object.freeze({ ...token });
  }
  consume(id, { capability, scope = {} } = {}) {
    const token = this.#tokens.get(id);
    if (!token || token.used || token.expiresAt < Date.now()) return { ok: false, reason: 'invalid_or_expired' };
    if (capability && token.capability !== capability) return { ok: false, reason: 'capability_mismatch' };
    for (const [key, value] of Object.entries(scope)) if (token.scope?.[key] !== value) return { ok: false, reason: `scope_mismatch:${key}` };
    token.used = true;
    return { ok: true, token: { ...token } };
  }
}

export function calculateRisk({ manifest = 0, host = 0, payload = 0, sourceTrust = 0 }) {
  return Math.max(manifest, host, payload, sourceTrust);
}

export function wrapUntrusted(data, source = 'external') {
  return Object.freeze({ trust: 'untrusted', source, nonce: makeId('boundary'), data, receivedAt: new Date().toISOString() });
}

export const constraints = new ConstraintRegister();
export const approvals = new ApprovalBroker();
