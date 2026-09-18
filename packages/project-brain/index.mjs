import { makeId } from '../contracts/index.mjs';
import { containsSecretLike, redactSecretLike } from '../guardrails/index.mjs';

export const ProjectEntityType = Object.freeze({
  PROJECT:'project', PERSON:'person', ORGANIZATION:'organization', DISCIPLINE:'discipline',
  ACTIVITY:'activity', MILESTONE:'milestone', MATERIAL:'material', DOCUMENT:'document',
  CONSTRAINT:'constraint', CONTRACT:'contract', ASSET:'asset', DECISION:'decision'
});

export const FactStatus = Object.freeze({ CURRENT:'current', SUPERSEDED:'superseded' });

const ENTITY_TYPES = new Set(Object.values(ProjectEntityType));

function clone(value) { return structuredClone(value); }
function bounded(value, max = 1200) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}
function iso(value = new Date().toISOString()) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError('invalid date');
  return parsed.toISOString();
}
function refs(items = [], max = 24) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, max).map((item) => {
    if (typeof item === 'string') return { id:bounded(item, 240) };
    if (!item || typeof item !== 'object') return null;
    return {
      id:bounded(item.id || '', 240), source:bounded(item.source || '', 600),
      type:bounded(item.type || '', 100), summary:bounded(item.summary || '', 800),
      sha:bounded(item.sha || '', 120)
    };
  }).filter((item) => item && (item.id || item.source));
}
function safeMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return redactSecretLike(Object.fromEntries(Object.entries(value).slice(0, 48)));
}

export class ProjectBrain {
  constructor(project) {
    this.project = Object.freeze(clone(project));
    this.entities = new Map();
    this.episodes = new Map();
    this.facts = new Map();
  }

  addEntity(input = {}) {
    const name = bounded(input.name, 240);
    const type = input.type || ProjectEntityType.ASSET;
    if (!name) throw new TypeError('entity requires name');
    if (!ENTITY_TYPES.has(type)) throw new TypeError('invalid entity type');
    const metadata = safeMetadata(input.metadata || {});
    if (containsSecretLike({ name, metadata })) throw new Error('secret-like entity metadata rejected');
    const entity = Object.freeze({
      id:input.id ? bounded(input.id, 240) : makeId('entity'), projectId:this.project.id,
      type, name, aliases:Object.freeze((input.aliases || []).slice(0, 16).map((x) => bounded(x, 180)).filter(Boolean)),
      metadata:Object.freeze(metadata), createdAt:new Date().toISOString()
    });
    this.entities.set(entity.id, entity);
    return clone(entity);
  }

  addEpisode(input = {}) {
    const summary = bounded(input.summary, 4000);
    const evidenceRefs = refs(input.evidenceRefs);
    if (!summary) throw new TypeError('episode requires summary');
    if (!evidenceRefs.length) throw new TypeError('episode requires evidenceRefs');
    if (containsSecretLike({ summary, evidenceRefs })) throw new Error('secret-like episode rejected');
    const episode = Object.freeze({
      id:input.id ? bounded(input.id, 240) : makeId('episode'), projectId:this.project.id,
      kind:bounded(input.kind || 'observation', 120), summary,
      observedAt:iso(input.observedAt || new Date().toISOString()),
      evidenceRefs:Object.freeze(evidenceRefs), metadata:Object.freeze(safeMetadata(input.metadata || {})),
      recordedAt:new Date().toISOString()
    });
    this.episodes.set(episode.id, episode);
    return clone(episode);
  }

  addFact(input = {}) {
    const subjectId = bounded(input.subjectId, 240);
    const predicate = bounded(input.predicate, 180);
    const object = bounded(input.object, 1200);
    const episodeId = bounded(input.episodeId, 240);
    if (!this.entities.has(subjectId)) throw new Error('fact subject entity not found in project');
    if (!predicate || !object) throw new TypeError('fact requires predicate and object');
    if (!episodeId || !this.episodes.has(episodeId)) throw new Error('fact requires project episode provenance');
    if (containsSecretLike({ predicate, object })) throw new Error('secret-like fact rejected');

    const validFrom = iso(input.validFrom || this.episodes.get(episodeId).observedAt);
    const now = new Date().toISOString();
    if (input.supersedeCurrent !== false) {
      for (const [id, fact] of this.facts.entries()) {
        if (fact.subjectId === subjectId && fact.predicate === predicate && fact.status === FactStatus.CURRENT) {
          this.facts.set(id, Object.freeze({ ...fact, status:FactStatus.SUPERSEDED, validTo:validFrom, invalidatedAt:now }));
        }
      }
    }

    const fact = Object.freeze({
      id:input.id ? bounded(input.id, 240) : makeId('fact'), projectId:this.project.id,
      subjectId, predicate, object, objectEntityId:input.objectEntityId ? bounded(input.objectEntityId, 240) : null,
      episodeId, evidenceRefs:Object.freeze(refs(input.evidenceRefs || this.episodes.get(episodeId).evidenceRefs)),
      status:FactStatus.CURRENT, validFrom, validTo:null, recordedAt:now, invalidatedAt:null
    });
    if (fact.objectEntityId && !this.entities.has(fact.objectEntityId)) throw new Error('fact object entity not found in project');
    this.facts.set(fact.id, fact);
    return clone(fact);
  }

  currentFacts({ subjectId = null, predicate = null } = {}) {
    return [...this.facts.values()].filter((fact) => fact.status === FactStatus.CURRENT)
      .filter((fact) => !subjectId || fact.subjectId === subjectId)
      .filter((fact) => !predicate || fact.predicate === predicate).map(clone);
  }

  factsAt(at, { subjectId = null, predicate = null } = {}) {
    const when = new Date(iso(at)).getTime();
    return [...this.facts.values()].filter((fact) => {
      const from = new Date(fact.validFrom).getTime();
      const to = fact.validTo ? new Date(fact.validTo).getTime() : Number.POSITIVE_INFINITY;
      return from <= when && when < to;
    }).filter((fact) => !subjectId || fact.subjectId === subjectId)
      .filter((fact) => !predicate || fact.predicate === predicate).map(clone);
  }

  evidenceForFact(factId) {
    const fact = this.facts.get(factId);
    if (!fact) return null;
    return { fact:clone(fact), episode:clone(this.episodes.get(fact.episodeId)), evidenceRefs:clone(fact.evidenceRefs) };
  }

  snapshot() {
    return { project:clone(this.project), entities:[...this.entities.values()].map(clone), episodes:[...this.episodes.values()].map(clone), facts:[...this.facts.values()].map(clone) };
  }
}

export class ProjectBrainRegistry {
  constructor() { this.projects = new Map(); this.brains = new Map(); this.adapters = new Map(); }

  registerProject(input = {}) {
    const name = bounded(input.name, 240);
    if (!name) throw new TypeError('project requires name');
    const project = Object.freeze({
      id:input.id ? bounded(input.id, 180) : makeId('project'), name,
      client:bounded(input.client || '', 240) || null, code:bounded(input.code || '', 120) || null,
      metadata:Object.freeze(safeMetadata(input.metadata || {})), createdAt:new Date().toISOString()
    });
    if (this.projects.has(project.id)) throw new Error('project already registered');
    this.projects.set(project.id, project);
    this.brains.set(project.id, new ProjectBrain(project));
    return clone(project);
  }

  registerAdapter(id, adapter) {
    const key = bounded(id, 120);
    if (!key || !adapter || typeof adapter.buildEpisodeSpec !== 'function' || typeof adapter.buildFactSearchSpec !== 'function') throw new TypeError('project brain adapter invalid');
    this.adapters.set(key, adapter); return this;
  }

  brain(projectId) { const brain = this.brains.get(projectId); if (!brain) throw new Error('project brain not found'); return brain; }
  getProject(projectId) { const value = this.projects.get(projectId); return value ? clone(value) : null; }
  listProjects() { return [...this.projects.values()].map(clone); }

  exportEpisode(projectId, episodeId, adapterId = 'graphiti') {
    const brain = this.brain(projectId); const episode = brain.episodes.get(episodeId);
    if (!episode) throw new Error('episode not found');
    const adapter = this.adapters.get(adapterId); if (!adapter) throw new Error('project brain adapter not registered');
    return clone(adapter.buildEpisodeSpec(brain.project, clone(episode)));
  }

  exportFactSearch(projectId, query, options = {}, adapterId = 'graphiti') {
    const brain = this.brain(projectId); const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error('project brain adapter not registered');
    return clone(adapter.buildFactSearchSpec(brain.project, query, options));
  }

  snapshot() {
    return { adapters:[...this.adapters.keys()], projects:this.listProjects(), brains:[...this.brains.values()].map((brain) => brain.snapshot()) };
  }
}
