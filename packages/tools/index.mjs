import { CapabilityState, createToolDescriptor } from '../contracts/index.mjs';

export class ToolRegistry {
  constructor() { this.tools = new Map(); }
  register(descriptor, invoke = null) {
    const tool = createToolDescriptor(descriptor);
    if (!tool.id) throw new TypeError('tool id required');
    this.tools.set(tool.id, { descriptor: tool, invoke });
    return tool;
  }
  setState(id, state) {
    const entry = this.tools.get(id); if (!entry) throw new Error(`tool not found: ${id}`);
    entry.descriptor = createToolDescriptor({ ...entry.descriptor, state });
    return entry.descriptor;
  }
  get(id) { return this.tools.get(id)?.descriptor || null; }
  list() { return [...this.tools.values()].map((e) => e.descriptor); }
  search(query, { limit = 8 } = {}) {
    const terms = String(query || '').toLowerCase().split(/\W+/).filter(Boolean);
    return this.list().map((tool) => {
      const haystack = `${tool.id} ${tool.title} ${tool.description} ${tool.tags.join(' ')}`.toLowerCase();
      const score = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
      return { tool, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.tool);
  }
  async invoke(id, input, context = {}) {
    const entry = this.tools.get(id); if (!entry) throw new Error(`tool not found: ${id}`);
    if (entry.descriptor.state === CapabilityState.UNAVAILABLE) throw new Error(`tool unavailable: ${id}`);
    if (typeof entry.invoke !== 'function') throw new Error(`tool registered without runtime adapter: ${id}`);
    return entry.invoke(input, context);
  }
}

export function createLegacyCapabilityCatalog(config = {}) {
  const registry = new ToolRegistry();
  const functions = config?.supabase?.functions || {};
  const add = (id, title, fn, tags = []) => registry.register({ id, title, description: `${title} through existing Pink server gateway`, state: fn ? CapabilityState.AVAILABLE : CapabilityState.UNAVAILABLE, requiresAuth: true, tags });
  add('ai.brain', 'Pink Brain', functions.brain, ['ai','reasoning']);
  add('ai.openai', 'OpenAI', functions.openai, ['ai','coding']);
  add('ai.claude', 'Claude', functions.claude, ['ai','review']);
  add('ai.nvidia', 'NVIDIA', functions.nvidia, ['ai','nvidia']);
  add('ai.gemini-research', 'Gemini Research', functions.geminiReasoning, ['ai','web','research']);
  add('vision.analyze', 'Pink Vision', functions.vision, ['camera','vision']);
  add('memory.cloud', 'Pink Memory', functions.memory || 'pink-memory', ['memory']);
  return registry;
}
