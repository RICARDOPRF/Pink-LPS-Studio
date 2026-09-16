import { makeId } from '../contracts/index.mjs';

export class TraceStore {
  constructor() { this.traces = []; }
  start({ taskId = null, goal = '', variant = 'current' } = {}) {
    const trace = { id: makeId('trace'), taskId, goal, variant, startedAt: performance?.now?.() ?? Date.now(), startedIso: new Date().toISOString(), events: [], metrics: {} };
    this.traces.push(trace); return trace;
  }
  event(trace, type, payload = {}) {
    trace.events.push({ id: makeId('evt'), type, at: new Date().toISOString(), ...payload }); return trace;
  }
  finish(trace, { success = true, tokens = null, cost = null } = {}) {
    const ended = performance?.now?.() ?? Date.now();
    trace.endedAt = ended; trace.durationMs = Math.max(0, ended - trace.startedAt); trace.success = Boolean(success);
    trace.metrics = { ...trace.metrics, tokens, cost, toolCalls: trace.events.filter((e) => e.type === 'tool').length };
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
