import { createEdgeFunctionInvoker } from '../providers/index.mjs';

export function createLegacyCloudAdapter(config = {}) {
  const supabase = config?.supabase || {};
  const functions = supabase.functions || {};
  const invoke = createEdgeFunctionInvoker({ url: supabase.url, anonKey: supabase.anonKey });

  const call = async (name, body) => {
    if (!name) throw new Error('edge function name missing');
    return invoke(name, body);
  };

  return Object.freeze({
    configured: Boolean(supabase.url && supabase.anonKey),
    brain(input, options = {}) {
      return call(functions.brain || 'pink-brain', { input, ...options });
    },
    memory: Object.freeze({
      health: () => call('pink-memory', { op: 'health' }),
      remember: (payload) => call('pink-memory', { op: 'remember', ...payload }),
      recall: (query, limit = 8) => call('pink-memory', { op: 'recall', query, limit }),
      people: () => call('pink-memory', { op: 'people_list' }),
      findPerson: (name) => call('pink-memory', { op: 'person_find', name }),
      projects: (query) => call('pink-memory', { op: 'recall', query, limit: 20 })
    }),
    research(input, options = {}) {
      return call(functions.geminiReasoning || 'pink-gemini-reasoning', { input, search: true, ...options });
    },
    vision(payload) {
      return call(functions.vision || 'pink-vision', payload);
    }
  });
}
