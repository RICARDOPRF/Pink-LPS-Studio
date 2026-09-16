export class SelfModel {
  constructor({ maxPrinciples = 24, promotionThreshold = 3 } = {}) {
    this.maxPrinciples = maxPrinciples;
    this.promotionThreshold = promotionThreshold;
    this.signals = new Map();
    this.principles = [];
  }
  observe(key, statement, evidence = null) {
    const item = this.signals.get(key) || { key, statement, hits: 0, evidence: [], firstSeenAt: new Date().toISOString() };
    item.hits += 1; if (evidence) item.evidence.push(evidence); item.lastSeenAt = new Date().toISOString(); this.signals.set(key, item);
    if (item.hits >= this.promotionThreshold && !this.principles.some((p) => p.key === key)) {
      this.principles.push({ key, statement, confidence: Math.min(1, .6 + item.hits * .08), promotedAt: new Date().toISOString(), sourceHits: item.hits });
      if (this.principles.length > this.maxPrinciples) this.principles.shift();
    }
    return this.snapshot();
  }
  compact() { return this.principles.map((p) => `- ${p.statement} (confidence ${Math.round(p.confidence*100)}%)`).join('\n'); }
  snapshot() { return { principles: structuredClone(this.principles), signals: [...this.signals.values()].map((x) => structuredClone(x)) }; }
}
