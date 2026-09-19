import { makeId } from '../contracts/index.mjs';

function now() { return globalThis.performance?.now?.() ?? Date.now(); }

export class TraceStore {
  constructor() { this.traces = []; }
  start({ taskId = null, goal = '', variant = 'current' } = {}) {
    const trace = { id: makeId('trace'), taskId, goal, variant, startedAt: now(), startedIso: new Date().toISOString(), events: [], spans: [], metrics: {} };
    this.traces.push(trace); return trace;
  }
  event(trace, type, payload = {}) {
    trace.events.push({ id: makeId('evt'), type, at: new Date().toISOString(), ...payload }); return trace;
  }
  startSpan(trace, { name, kind = 'custom', parentId = null, attributes = {} } = {}) {
    if (!trace || !name) throw new TypeError('trace and span name required');
    if (parentId && !trace.spans.some((span) => span.id === parentId)) throw new Error('parent span not found');
    const span = { id:makeId('span'), name:String(name), kind:String(kind), parentId, startedAt:now(), startedIso:new Date().toISOString(), status:'running', attributes:{ ...attributes } };
    trace.spans.push(span); return span;
  }
  finishSpan(trace, spanOrId, { status = 'ok', attributes = {} } = {}) {
    const id = typeof spanOrId === 'string' ? spanOrId : spanOrId?.id;
    const span = trace?.spans?.find((item) => item.id === id);
    if (!span) throw new Error('span not found');
    const ended = now();
    span.endedAt = ended; span.endedIso = new Date().toISOString(); span.durationMs = Math.max(0, ended - span.startedAt); span.status = String(status); span.attributes = { ...span.attributes, ...attributes };
    return structuredClone(span);
  }
  finish(trace, { success = true, tokens = null, cost = null } = {}) {
    const ended = now();
    trace.endedAt = ended; trace.durationMs = Math.max(0, ended - trace.startedAt); trace.success = Boolean(success);
    trace.metrics = {
      ...trace.metrics, tokens, cost,
      toolCalls: trace.events.filter((e) => e.type === 'tool').length,
      handoffs: trace.events.filter((e) => e.type === 'handoff').length,
      guardrailTrips: trace.events.filter((e) => e.type === 'guardrail' && e.status && e.status !== 'pass').length,
      spans: trace.spans.length
    };
    return structuredClone(trace);
  }
  list() { return this.traces.map((t) => structuredClone(t)); }
}

export function summarizeVariant(traces, variant) {
  const set = (traces || []).filter((t) => t.variant === variant && typeof t.success === 'boolean');
  if (!set.length) return { variant, samples: 0, successRate: null, latencyMs: null, toolCalls: null };
  const mean = (values) => values.reduce((a,b) => a+b, 0) / values.length;
  return {
    variant,
    samples: set.length,
    successRate: set.filter((t) => t.success).length / set.length,
    latencyMs: mean(set.map((t) => t.durationMs || 0)),
    toolCalls: mean(set.map((t) => t.metrics?.toolCalls || 0))
  };
}

export function compareVariants(traces, baseline = 'baseline', candidate = 'candidate') {
  const before = summarizeVariant(traces, baseline); const after = summarizeVariant(traces, candidate);
  const delta = (a,b) => a == null || b == null ? null : b-a;
  return {
    before, after,
    delta: {
      successRate: delta(before.successRate, after.successRate),
      latencyMs: delta(before.latencyMs, after.latencyMs),
      toolCalls: delta(before.toolCalls, after.toolCalls)
    },
    evidenceSufficient: before.samples >= 3 && after.samples >= 3
  };
}
