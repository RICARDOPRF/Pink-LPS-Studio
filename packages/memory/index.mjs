import { MemoryLayer, makeId } from '../contracts/index.mjs';

export class LayeredMemory {
  constructor({ maxWorking = 24, maxDaily = 200 } = {}) {
    this.maxWorking = maxWorking;
    this.maxDaily = maxDaily;
    this.layers = new Map(Object.values(MemoryLayer).map((layer) => [layer, []]));
  }

  remember({ layer = MemoryLayer.WORKING, text, type = 'note', importance = 0.5, source = 'runtime', provenance = null, metadata = {} }) {
    if (!this.layers.has(layer)) throw new Error(`unknown memory layer: ${layer}`);
    if (!String(text || '').trim()) throw new TypeError('memory text required');
    const record = {
      id: makeId('mem'), layer, type, text: String(text).trim(), importance: Math.max(0, Math.min(1, Number(importance) || 0)),
      source, provenance, metadata, createdAt: new Date().toISOString(), lastAccessedAt: null, hits: 0
    };
    const bucket = this.layers.get(layer); bucket.push(record); this.#trim(layer, bucket); return structuredClone(record);
  }

  recall(query, { layers = Object.values(MemoryLayer), limit = 8 } = {}) {
    const terms = String(query || '').toLowerCase().split(/\W+/).filter(Boolean);
    const candidates = layers.flatMap((layer) => this.layers.get(layer) || []);
    const ranked = candidates.map((record) => {
      const haystack = `${record.text} ${record.type} ${JSON.stringify(record.metadata)}`.toLowerCase();
      const lexical = terms.length ? terms.filter((term) => haystack.includes(term)).length / terms.length : 0;
      const recency = Math.max(0, 1 - (Date.now() - Date.parse(record.createdAt)) / (30 * 86400_000));
      return { record, score: lexical * 0.65 + record.importance * 0.25 + recency * 0.10 };
    }).sort((a, b) => b.score - a.score).slice(0, limit);
    for (const item of ranked) { item.record.hits += 1; item.record.lastAccessedAt = new Date().toISOString(); }
    return ranked.map(({ record, score }) => ({ ...structuredClone(record), score }));
  }

  digest(query, options = {}) {
    return this.recall(query, options).map((m) => `- [${m.layer}/${m.type}] ${m.text}`).join('\n');
  }

  #trim(layer, bucket) {
    const max = layer === MemoryLayer.WORKING ? this.maxWorking : layer === MemoryLayer.DAILY ? this.maxDaily : Infinity;
    if (bucket.length > max) bucket.splice(0, bucket.length - max);
  }
}

export class PinkMemoryCloudAdapter {
  constructor({ invoke }) { if (typeof invoke !== 'function') throw new TypeError('invoke function required'); this.invoke = invoke; }
  remember(payload) { return this.invoke({ op: 'remember', ...payload }); }
  recall(query, limit = 8) { return this.invoke({ op: 'recall', query, limit }); }
}
