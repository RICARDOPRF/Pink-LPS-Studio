export const GRAPHITI_UPSTREAM = Object.freeze({
  repository:'getzep/graphiti',
  revision:'de8eb5b896c05ed1b5b329d4cb52015446d65e21',
  license:'Apache-2.0',
  integrationMode:'external-isolated-service'
});

function slug(value) {
  return String(value || 'project').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'project';
}
function bounded(value, max = 1200) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

export class GraphitiProjectBrainAdapter {
  constructor({ revision = GRAPHITI_UPSTREAM.revision } = {}) { this.revision = String(revision || GRAPHITI_UPSTREAM.revision); }

  capabilities() {
    return Object.freeze({
      temporalFacts:true,
      episodes:true,
      provenance:true,
      projectIsolation:'group_id',
      factSearchDateFilters:true,
      execute:false,
      upstream:Object.freeze({ ...GRAPHITI_UPSTREAM, revision:this.revision })
    });
  }

  groupId(project) { return `lps-${slug(project?.id || project?.code || project?.name)}`; }

  buildEpisodeSpec(project, episode) {
    if (!project?.id || !episode?.id) throw new TypeError('Graphiti episode spec requires project and episode');
    if (episode.projectId !== project.id) throw new Error('cross-project episode export blocked');
    return Object.freeze({
      adapter:'graphiti', execute:false, executionPolicy:'external-isolated-service',
      upstream:Object.freeze({ ...GRAPHITI_UPSTREAM, revision:this.revision }),
      tool:'add_episode',
      arguments:Object.freeze({
        group_id:this.groupId(project),
        name:`${bounded(project.name, 140)} · ${bounded(episode.kind, 80)} · ${episode.id}`,
        source:'json',
        source_description:'Pink Project Brain evidence-backed project episode',
        reference_time:episode.observedAt,
        body:JSON.stringify({
          project:{ id:project.id, name:project.name, code:project.code || null },
          episode:{ id:episode.id, kind:episode.kind, summary:episode.summary, observedAt:episode.observedAt, evidenceRefs:episode.evidenceRefs }
        })
      })
    });
  }

  buildFactSearchSpec(project, query, options = {}) {
    if (!project?.id) throw new TypeError('Graphiti fact search requires project');
    const text = bounded(query, 1600);
    if (!text) throw new TypeError('Graphiti fact search requires query');
    const args = { group_ids:[this.groupId(project)], query:text };
    if (options.validAt) args.valid_at = new Date(options.validAt).toISOString();
    if (options.invalidAt) args.invalid_at = new Date(options.invalidAt).toISOString();
    if (Array.isArray(options.edgeTypes) && options.edgeTypes.length) args.edge_types = options.edgeTypes.slice(0, 16).map((x) => bounded(x, 120));
    return Object.freeze({
      adapter:'graphiti', execute:false, executionPolicy:'external-isolated-service',
      upstream:Object.freeze({ ...GRAPHITI_UPSTREAM, revision:this.revision }),
      tool:'search_memory_facts', arguments:Object.freeze(args)
    });
  }
}
