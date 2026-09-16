import { makeId } from '../contracts/index.mjs';

export class PulseEngine {
  constructor({ maxPerTick = 1 } = {}) { this.maxPerTick = maxPerTick; this.items = []; }
  propose({ title, reason, evidence = [], risk = 'LOW', source = 'runtime' }) {
    const signature = `${title}|${reason}`.toLowerCase().replace(/\s+/g,' ').trim();
    if (this.items.some((x) => x.signature === signature && !['declined','completed','suppressed'].includes(x.status))) return null;
    const item = { id: makeId('pulse'), title, reason, evidence, risk, source, signature, status:'proposed', createdAt:new Date().toISOString() };
    this.items.push(item); return structuredClone(item);
  }
  tick() {
    return this.items.filter((x) => x.status === 'proposed' && !['HIGH','CRITICAL'].includes(String(x.risk).toUpperCase())).slice(0, this.maxPerTick).map((x) => structuredClone(x));
  }
  setStatus(id, status) { const item=this.items.find((x)=>x.id===id); if(!item) throw new Error('pulse item not found'); item.status=status; return structuredClone(item); }
}
