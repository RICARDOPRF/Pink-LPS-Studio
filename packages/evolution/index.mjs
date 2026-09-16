import { makeId } from '../contracts/index.mjs';
import { compareVariants } from '../observability/index.mjs';

export class EvolutionEngine {
  constructor({ traces = null } = {}) { this.traces = traces; this.candidates = new Map(); }

  propose({ problem, evidence = [], hypothesis, benefit = '', risk = 'LOW', testPlan = [], source = 'runtime' }) {
    if (!problem || !hypothesis) throw new TypeError('problem and hypothesis required');
    const candidate = {
      id: makeId('evo'), problem, evidence, hypothesis, benefit, risk, testPlan, source,
      status: 'awaiting_human_agreement', approvedForEvolution: false, approvedAt: null, approvedBy: null,
      productionApproved: false, createdAt: new Date().toISOString(), benchmark: null
    };
    this.candidates.set(candidate.id, candidate); return structuredClone(candidate);
  }

  approve(id, approvedBy = 'Paulo Ricardo') {
    const candidate = this.candidates.get(id); if (!candidate) throw new Error('candidate not found');
    candidate.approvedForEvolution = true; candidate.approvedAt = new Date().toISOString(); candidate.approvedBy = approvedBy; candidate.status = 'approved_for_experiment';
    return structuredClone(candidate);
  }

  attachBenchmark(id, traces, baseline = 'baseline', variant = 'candidate') {
    const candidate = this.candidates.get(id); if (!candidate) throw new Error('candidate not found');
    candidate.benchmark = compareVariants(traces, baseline, variant);
    candidate.status = candidate.benchmark.evidenceSufficient ? 'evaluated' : 'needs_more_evidence';
    return structuredClone(candidate);
  }

  readyForDraftPr(id) {
    const c = this.candidates.get(id); if (!c?.approvedForEvolution || !c?.benchmark?.evidenceSufficient) return false;
    const d = c.benchmark.delta; return (d.successRate ?? 0) >= 0 && (d.latencyMs ?? 0) <= 0;
  }

  list() { return [...this.candidates.values()].map((c) => structuredClone(c)); }
}

export const EVOLUTION_POLICY = Object.freeze({
  canObserve: true,
  canPropose: true,
  requiresHumanAgreementBeforeCode: true,
  requiresMeasuredBaseline: true,
  requiresBehavioralEvals: true,
  canOpenDraftPr: true,
  canMergeMain: false,
  canPublishProduction: false
});
