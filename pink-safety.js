// Pink Phase 0 — Foundation & Safety
// Central action policy, approval lifecycle and redacted audit trail.
(() => {
  if (window.PinkSafety || window.PinkApproval) return;

  const AUDIT_KEY = 'pink_action_audit_v1';
  const PENDING_KEY = 'pink_pending_action_meta_v1';
  const DEFAULT_TTL_MS = 10 * 60 * 1000;
  const MAX_AUDIT = 100;
  const executors = new Map();
  const actions = new Map();
  let pendingId = null;

  const RISKS = Object.freeze({
    READ_ONLY: 'read_only',
    REVERSIBLE_WRITE: 'reversible_write',
    SENSITIVE_WRITE: 'sensitive_write',
    DESTRUCTIVE: 'destructive',
    BILLING: 'billing',
    CREDENTIALS: 'credentials',
    SECURITY: 'security'
  });

  const SIMPLE_APPROVAL = new Set([RISKS.REVERSIBLE_WRITE]);
  const STRONG_APPROVAL = new Set([
    RISKS.SENSITIVE_WRITE,
    RISKS.DESTRUCTIVE,
    RISKS.BILLING,
    RISKS.CREDENTIALS,
    RISKS.SECURITY
  ]);

  const FORBIDDEN_TYPES = new Set([
    'credentials.expose',
    'credentials.store_public',
    'security.weaken',
    'audit.disable',
    'approval.self_approve'
  ]);

  const SECRET_KEY = /(api.?key|token|secret|password|passwd|authorization|credential|cookie|session.?id|jwt|service.?role|private.?key)/i;
  const SECRET_TEXT = /(bearer\s+[a-z0-9._~+\/-]+=*|sk-[a-z0-9_-]{12,}|sb_secret_[a-z0-9_-]{8,}|eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,})/ig;

  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const now = () => Date.now();
  const makeId = () => globalThis.crypto?.randomUUID?.() || `pink-${now()}-${Math.random().toString(36).slice(2, 10)}`;

  function redactText(value) {
    return String(value ?? '').replace(SECRET_TEXT, '[REDACTED]');
  }

  function sanitize(value, depth = 0) {
    if (depth > 5) return '[TRUNCATED]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return redactText(value).slice(0, 1000);
    if (Array.isArray(value)) return value.slice(0, 25).map(item => sanitize(item, depth + 1));
    if (typeof value === 'object') {
      const output = {};
      for (const [key, item] of Object.entries(value).slice(0, 40)) {
        output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitize(item, depth + 1);
      }
      return output;
    }
    return redactText(String(value));
  }

  function readAudit() {
    try {
      const value = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function appendAudit(event, action, detail = null) {
    const entry = sanitize({
      at: now(),
      event,
      id: action?.id || null,
      type: action?.type || null,
      risk: action?.risk || null,
      target: action?.target || null,
      summary: action?.summary || null,
      status: action?.status || null,
      detail
    });
    try {
      const audit = readAudit();
      audit.push(entry);
      localStorage.setItem(AUDIT_KEY, JSON.stringify(audit.slice(-MAX_AUDIT)));
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('pinksafety:audit', { detail: entry }));
    } catch (_) {}
    return entry;
  }

  function persistPendingMeta(action) {
    try {
      if (!action) sessionStorage.removeItem(PENDING_KEY);
      else sessionStorage.setItem(PENDING_KEY, JSON.stringify(sanitize({
        id: action.id,
        type: action.type,
        target: action.target,
        summary: action.summary,
        risk: action.risk,
        status: action.status,
        createdAt: action.createdAt,
        expiresAt: action.expiresAt
      })));
    } catch (_) {}
  }

  function publicAction(action) {
    if (!action) return null;
    return sanitize({
      id: action.id,
      type: action.type,
      target: action.target,
      summary: action.summary,
      risk: action.risk,
      status: action.status,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      requiresStrongApproval: STRONG_APPROVAL.has(action.risk)
    });
  }

  function emit(name, action, extra = {}) {
    try {
      window.dispatchEvent(new CustomEvent(`pinkapproval:${name}`, {
        detail: { action: publicAction(action), ...sanitize(extra) }
      }));
    } catch (_) {}
  }

  function isExpired(action) {
    return !action || now() > Number(action.expiresAt || 0);
  }

  function requireAction(id = pendingId) {
    const action = id ? actions.get(id) : null;
    if (!action) throw new Error('Nenhuma ação pendente para aprovação.');
    if (isExpired(action)) {
      action.status = 'expired';
      if (pendingId === action.id) pendingId = null;
      persistPendingMeta(null);
      appendAudit('expired', action);
      emit('expired', action);
      throw new Error('A aprovação expirou. Prepare a ação novamente.');
    }
    return action;
  }

  function validateDescriptor(descriptor = {}) {
    const type = String(descriptor.type || '').trim();
    const summary = String(descriptor.summary || '').trim();
    const target = String(descriptor.target || '').trim();
    const risk = String(descriptor.risk || RISKS.REVERSIBLE_WRITE);
    if (!type) throw new Error('A ação precisa de um tipo.');
    if (!summary) throw new Error('A ação precisa de um resumo legível.');
    if (!target) throw new Error('A ação precisa de um alvo explícito.');
    if (!Object.values(RISKS).includes(risk)) throw new Error(`Risco de ação inválido: ${risk}`);
    if (FORBIDDEN_TYPES.has(type)) throw new Error(`A política da Pink bloqueia a ação: ${type}`);
    return { type, summary: redactText(summary), target: redactText(target), risk };
  }

  function registerExecutor(type, executor) {
    const key = String(type || '').trim();
    if (!key || typeof executor !== 'function') throw new Error('Executor inválido.');
    executors.set(key, executor);
    return () => executors.delete(key);
  }

  function prepare(descriptor = {}) {
    const clean = validateDescriptor(descriptor);
    if (pendingId) {
      const previous = actions.get(pendingId);
      if (previous && !['completed', 'cancelled', 'failed', 'expired'].includes(previous.status)) {
        previous.status = 'cancelled';
        appendAudit('superseded', previous, { byType: clean.type });
        emit('cancelled', previous, { reason: 'superseded' });
      }
    }

    const ttlMs = Math.min(Math.max(Number(descriptor.ttlMs) || DEFAULT_TTL_MS, 15_000), 30 * 60 * 1000);
    const action = {
      id: makeId(),
      ...clean,
      payload: descriptor.payload,
      metadata: sanitize(descriptor.metadata || {}),
      createdAt: now(),
      expiresAt: now() + ttlMs,
      status: 'prepared',
      approvedAt: null,
      executedAt: null
    };
    actions.set(action.id, action);
    pendingId = action.id;
    persistPendingMeta(action);
    appendAudit('prepared', action);
    emit('prepared', action);
    return publicAction(action);
  }

  function preview(id = pendingId) {
    const action = requireAction(id);
    if (action.status === 'prepared') action.status = 'previewed';
    persistPendingMeta(action);
    appendAudit('previewed', action);
    emit('previewed', action);
    return publicAction(action);
  }

  function verify(id = pendingId) {
    const action = requireAction(id);
    if (!executors.has(action.type)) throw new Error(`Nenhum executor registrado para ${action.type}.`);
    if (FORBIDDEN_TYPES.has(action.type)) throw new Error(`A política da Pink bloqueia a ação: ${action.type}`);
    if (!['prepared', 'previewed', 'verified'].includes(action.status)) {
      throw new Error(`A ação não pode ser verificada no estado ${action.status}.`);
    }
    action.status = 'verified';
    persistPendingMeta(action);
    appendAudit('verified', action);
    emit('verified', action);
    return publicAction(action);
  }

  function approve(id = pendingId, context = {}) {
    const action = requireAction(id);
    if (!['verified', 'previewed', 'prepared'].includes(action.status)) {
      throw new Error(`A ação não pode ser aprovada no estado ${action.status}.`);
    }
    if (!executors.has(action.type)) throw new Error(`Nenhum executor registrado para ${action.type}.`);
    if (STRONG_APPROVAL.has(action.risk) && context.strong !== true) {
      throw new Error('Esta ação exige confirmação reforçada antes de executar.');
    }
    action.status = 'approved';
    action.approvedAt = now();
    persistPendingMeta(action);
    appendAudit('approved', action, { source: context.source || 'explicit' });
    emit('approved', action);
    return publicAction(action);
  }

  async function execute(id = pendingId) {
    const action = requireAction(id);
    if (action.risk !== RISKS.READ_ONLY && action.status !== 'approved') {
      throw new Error('A ação ainda não foi aprovada explicitamente.');
    }
    const executor = executors.get(action.type);
    if (!executor) throw new Error(`Nenhum executor registrado para ${action.type}.`);
    action.status = 'executing';
    persistPendingMeta(action);
    appendAudit('executing', action);
    emit('executing', action);
    try {
      const result = await executor({
        action: publicAction(action),
        payload: action.payload,
        metadata: action.metadata
      });
      action.status = 'completed';
      action.executedAt = now();
      appendAudit('completed', action, { result: sanitize(result) });
      emit('completed', action, { result: sanitize(result) });
      if (pendingId === action.id) pendingId = null;
      persistPendingMeta(null);
      action.payload = undefined;
      return result;
    } catch (error) {
      action.status = 'failed';
      appendAudit('failed', action, { error: error?.message || String(error) });
      emit('failed', action, { error: error?.message || String(error) });
      if (pendingId === action.id) pendingId = null;
      persistPendingMeta(null);
      action.payload = undefined;
      throw error;
    }
  }

  function cancel(id = pendingId, reason = 'user_cancelled') {
    const action = requireAction(id);
    if (['completed', 'failed', 'cancelled'].includes(action.status)) return false;
    action.status = 'cancelled';
    action.payload = undefined;
    if (pendingId === action.id) pendingId = null;
    persistPendingMeta(null);
    appendAudit('cancelled', action, { reason });
    emit('cancelled', action, { reason });
    return true;
  }

  function confirms(text = '') {
    const value = normalize(text);
    return /^(sim|confirmo|confirmado|pode fazer|pode executar|pode alterar|pode mudar|pode salvar|faz|manda ver|ok|okay)\b/.test(value);
  }

  function cancels(text = '') {
    const value = normalize(text);
    return /^(nao|cancela|cancelar|deixa|esquece|aborta|parar)\b/.test(value);
  }

  async function confirmText(text, context = {}) {
    const action = requireAction();
    if (cancels(text)) {
      cancel(action.id, 'explicit_cancel');
      return { cancelled: true };
    }
    if (!confirms(text)) return { matched: false, action: publicAction(action) };
    if (STRONG_APPROVAL.has(action.risk) && context.strong !== true) {
      return { matched: true, requiresStrongApproval: true, action: publicAction(action) };
    }
    if (action.status !== 'verified') verify(action.id);
    approve(action.id, { source: context.source || 'voice', strong: context.strong === true });
    const result = await execute(action.id);
    return { matched: true, executed: true, result };
  }

  function readPendingMeta() {
    try { return sanitize(JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null')); }
    catch (_) { return null; }
  }

  function policySnapshot() {
    return {
      risks: { ...RISKS },
      simpleApproval: [...SIMPLE_APPROVAL],
      strongApproval: [...STRONG_APPROVAL],
      forbiddenTypes: [...FORBIDDEN_TYPES],
      defaultTtlMs: DEFAULT_TTL_MS
    };
  }

  window.PinkSafety = Object.freeze({
    RISKS,
    sanitize,
    redactText,
    requiresApproval: risk => String(risk) !== RISKS.READ_ONLY,
    requiresStrongApproval: risk => STRONG_APPROVAL.has(String(risk)),
    isForbidden: type => FORBIDDEN_TYPES.has(String(type || '')),
    policy: policySnapshot,
    audit: () => readAudit().map(item => sanitize(item))
  });

  window.PinkApproval = Object.freeze({
    registerExecutor,
    prepare,
    preview,
    verify,
    approve,
    execute,
    cancel,
    confirmText,
    get pending() {
      try { return pendingId ? publicAction(requireAction(pendingId)) : null; }
      catch (_) { return null; }
    },
    get pendingMeta() { return readPendingMeta(); },
    get audit() { return window.PinkSafety.audit(); }
  });

  appendAudit('engine_ready', null, { version: '0.1.0' });
  window.dispatchEvent(new CustomEvent('pinksafety:ready', { detail: { version: '0.1.0' } }));
})();
