import { TaskStatus, makeId, assertTask, createEvidence } from '../contracts/index.mjs';

export class TaskRuntime {
  constructor({ storage = null, storageKey = 'pink-next:tasks' } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.tasks = new Map();
    this.restore();
  }

  create({ goal, plan = [], metadata = {} }) {
    const task = {
      id: makeId('task'), goal: String(goal), status: TaskStatus.QUEUED,
      plan: plan.map((label, index) => ({ id: `step_${index + 1}`, label: String(label), status: 'pending' })),
      currentStep: 0, checkpoints: [], evidence: [], metadata,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    assertTask(task); this.tasks.set(task.id, task); this.persist(); return structuredClone(task);
  }

  get(id) { const task = this.tasks.get(id); return task ? structuredClone(task) : null; }
  list() { return [...this.tasks.values()].map((t) => structuredClone(t)); }

  start(id) { return this.#update(id, (t) => { t.status = TaskStatus.RUNNING; if (t.plan[0]) t.plan[0].status = 'running'; }); }
  pause(id, reason = 'human_input_required') { return this.#update(id, (t) => { t.status = TaskStatus.PAUSED; t.pauseReason = reason; this.#checkpoint(t, 'pause'); }); }
  block(id, reason = 'blocked') { return this.#update(id, (t) => { t.status = TaskStatus.BLOCKED; t.blockReason = String(reason || 'blocked'); this.#checkpoint(t, 'blocked'); }); }
  resume(id) { return this.#update(id, (t) => { if (t.status !== TaskStatus.PAUSED && t.status !== TaskStatus.BLOCKED) throw new Error('task is not resumable'); t.status = TaskStatus.RUNNING; t.pauseReason = null; t.blockReason = null; this.#checkpoint(t, 'resume'); }); }

  completeStep(id, evidence = null) {
    return this.#update(id, (t) => {
      const step = t.plan[t.currentStep];
      if (!step) throw new Error('no active step');
      step.status = 'completed';
      if (evidence) t.evidence.push(evidence.type ? evidence : createEvidence(evidence));
      t.currentStep += 1;
      if (t.currentStep >= t.plan.length) t.status = TaskStatus.COMPLETED;
      else t.plan[t.currentStep].status = 'running';
      this.#checkpoint(t, 'step_completed');
    });
  }

  fail(id, reason) { return this.#update(id, (t) => { t.status = TaskStatus.FAILED; t.failureReason = String(reason || 'unknown'); this.#checkpoint(t, 'failed'); }); }
  checkpoint(id, label = 'manual') { return this.#update(id, (t) => this.#checkpoint(t, label)); }

  #checkpoint(task, label) {
    task.checkpoints.push({ id: makeId('checkpoint'), label, status: task.status, currentStep: task.currentStep, at: new Date().toISOString() });
    if (task.checkpoints.length > 50) task.checkpoints.splice(0, task.checkpoints.length - 50);
  }

  #update(id, mutator) {
    const task = this.tasks.get(id); if (!task) throw new Error(`task not found: ${id}`);
    mutator(task); task.updatedAt = new Date().toISOString(); this.persist(); return structuredClone(task);
  }

  persist() { if (!this.storage) return; this.storage.setItem(this.storageKey, JSON.stringify([...this.tasks.values()])); }
  restore() {
    if (!this.storage) return;
    try { for (const task of JSON.parse(this.storage.getItem(this.storageKey) || '[]')) this.tasks.set(task.id, task); } catch { this.tasks.clear(); }
  }
}
