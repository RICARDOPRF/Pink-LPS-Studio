export const TaskStatus = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const RiskLevel = Object.freeze({
  READ_ONLY: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
});

export const CapabilityState = Object.freeze({
  AVAILABLE: 'available',
  DEGRADED: 'degraded',
  REGISTERED: 'registered_unverified',
  UNAVAILABLE: 'unavailable'
});

export const MemoryLayer = Object.freeze({
  WORKING: 'working',
  DAILY: 'daily',
  PERSISTENT: 'persistent',
  PEOPLE: 'people',
  PROJECTS: 'projects',
  DECISIONS: 'decisions',
  RAW_EVIDENCE: 'raw_evidence',
  EVOLUTION: 'evolution'
});

export function makeId(prefix = 'pink') {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function assertTask(task) {
  if (!task || typeof task !== 'object') throw new TypeError('task must be an object');
  if (!task.id || !task.goal) throw new TypeError('task requires id and goal');
  if (!Object.values(TaskStatus).includes(task.status)) throw new TypeError('invalid task status');
  return task;
}

export function createEvidence({ type, source, summary, data = null, at = new Date().toISOString() }) {
  if (!type || !source || !summary) throw new TypeError('evidence requires type, source and summary');
  return Object.freeze({ id: makeId('ev'), type, source, summary, data, at });
}

export function createToolDescriptor(input) {
  const risk = Number.isFinite(input?.risk) ? input.risk : RiskLevel.LOW;
  return Object.freeze({
    id: String(input?.id || ''),
    title: String(input?.title || input?.id || ''),
    description: String(input?.description || ''),
    risk,
    state: input?.state || CapabilityState.REGISTERED,
    readOnly: Boolean(input?.readOnly),
    requiresAuth: Boolean(input?.requiresAuth),
    tags: Object.freeze([...(input?.tags || [])])
  });
}
