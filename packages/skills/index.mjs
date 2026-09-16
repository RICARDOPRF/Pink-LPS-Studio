import { makeId } from '../contracts/index.mjs';

export class SkillRegistry {
  constructor() { this.skills = new Map(); }
  register({ id = makeId('skill'), name, description = '', steps = [], limits = {}, source = 'native' }) {
    if (!name) throw new TypeError('skill name required');
    const skill = Object.freeze({ id, name, description, steps: Object.freeze(steps.map((s) => ({ ...s }))), limits: Object.freeze({ ...limits }), source });
    this.skills.set(id, skill); return skill;
  }
  get(id) { return this.skills.get(id) || null; }
  list() { return [...this.skills.values()]; }
  search(query, limit = 5) {
    const terms = String(query || '').toLowerCase().split(/\W+/).filter(Boolean);
    return this.list().map((skill) => ({ skill, score: terms.filter((t) => `${skill.name} ${skill.description}`.toLowerCase().includes(t)).length }))
      .filter((x) => x.score > 0).sort((a,b) => b.score-a.score).slice(0, limit).map((x) => x.skill);
  }
}

export class SkillRunner {
  constructor({ tools, traces = null } = {}) { this.tools = tools; this.traces = traces; }
  async run(skill, input = {}, context = {}) {
    const results = [];
    for (const [index, step] of skill.steps.entries()) {
      if (!step.tool) throw new Error(`skill step ${index + 1} missing tool`);
      const result = await this.tools.invoke(step.tool, { ...input, ...(step.input || {}) }, context);
      results.push({ step: index + 1, tool: step.tool, result });
    }
    return { skillId: skill.id, results };
  }
}

export function discoverSkillCandidates(traces, { minOccurrences = 3 } = {}) {
  const counts = new Map();
  for (const trace of traces || []) {
    const signature = (trace.events || []).filter((e) => e.type === 'tool').map((e) => e.name).join(' → ');
    if (!signature) continue;
    const item = counts.get(signature) || { signature, occurrences: 0, traceIds: [] };
    item.occurrences += 1; item.traceIds.push(trace.id); counts.set(signature, item);
  }
  return [...counts.values()].filter((x) => x.occurrences >= minOccurrences).sort((a,b) => b.occurrences-a.occurrences);
}
