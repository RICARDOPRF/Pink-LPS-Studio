# Phase 4 — Memory & People Graph

## Status

COMPLETE_SAFE_WITH_EXTERNAL_VALIDATION

## Start commit

`afd866418f81757a5a98ddaae9cd33754604b36c`

## End branch / gate commit

- Branch: `phase/4-memory-people-graph`
- Gate commit: `07962fd46956a33cfaef19ac077d00c088031c36`
- Pink CI run: `34757928251`
- Runtime checks: PASS
- Playwright desktop/mobile smoke: PASS

## Features added

- Selective Memory Curator: persist important facts, preferences, decisions, corrections, project aliases and explicit user instructions; reject transient chatter by default.
- Secret redaction before persistence for private keys, bearer credentials, JWTs, passwords, generic tokens and common API credential formats.
- Stable fingerprint-based memory deduplication.
- Recall relevance scoring using lexical overlap, importance and recency.
- People Graph using self-reported names and relationships only; never voice biometrics and never authentication by name/relationship.
- Project Memory foundation and alias registry.
- Legacy `pink_people_memory_v1` migration/hydration.
- Local persistent fallback (`pink_memory_fallback_v1`) when cloud memory is unavailable.
- Production-only lazy-loaded Supabase Memory Cloud adapter.
- Anonymous/authenticated user bootstrap into a personal tenant when Supabase Auth permits the anonymous sign-in.
- Tenant-scoped RLS foundation across Pink memory/people/projects/sessions/actions/audit/integrations/devices/evolution/review/experiment/approval/deployment tables.
- Append-only user audit policy (SELECT + INSERT, no UPDATE/DELETE policy).
- Supabase migration files versioned in Git.

## Supabase migrations applied

- `20260913123341 pink_memory_people_graph_v1`
- `20260913123403 pink_memory_security_hardening`
- `20260913124232 pink_memory_audit_append_only`
- `20260913124320 pink_memory_performance_hardening`

## Security findings and fixes

1. Initial Supabase advisor found exposed callable `SECURITY DEFINER` helpers. Fixed by moving privileged membership evaluation to the `private` schema, keeping a `SECURITY INVOKER` public wrapper, and revoking RPC execution from anon/public as appropriate.
2. Audit log initially used a broad member policy. Replaced with append-only SELECT/INSERT policies.
3. Memory redactor initially missed generic `token=value`. Contract test caught it; redaction now includes generic token assignments.
4. People relationship adapter initially defaulted `target_user_id` to the anonymous browser user. Fixed: self-reported relation such as “namorada do Paulo” is stored by `target_label=Paulo` unless an explicit target user ID is known.
5. Performance advisor identified auth RLS init-plan warnings and uncovered foreign keys. Policies were optimized with `(select auth.uid())` and foreign-key indexes were added. Remaining advisor messages are only INFO for newly created, not-yet-used indexes.

## Database validation

Direct database inspection confirmed all public `pink_*` tables are RLS-enabled and have policies. `pink_audit_log` has separate select and insert policies. Security advisor has no remaining Pink security warning; the only remaining security INFO belongs to the unrelated pre-existing `travel-photos` table.

## Tests run

- Secret scan
- Dependency/license audit
- JavaScript syntax checks
- Foundation safety contracts
- Core Intelligence contracts
- Voice OS contracts
- Memory & People Graph contracts
- Legacy people migration
- Deduplication
- Secret redaction
- Recall relevance
- People relationship memory
- Project alias resolution
- Cloud failure/local fallback
- Presence / avatar / registry / validation / lip-sync regression
- Holographic UI regression
- Adaptive performance/runtime health regression
- Playwright desktop smoke
- Playwright iPhone viewport smoke
- Cross-page local memory persistence
- Supabase security advisor
- Supabase performance advisor
- Direct RLS/policy inspection

## Known limitation / external validation

The available Supabase connector does not expose the project’s Anonymous Sign-In Auth toggle, and container networking cannot be used as evidence for the public Auth endpoint. Therefore the live production anonymous-auth bootstrap is not claimed as verified. If Anonymous Sign-In is disabled, Pink automatically remains on the tested local memory fallback instead of breaking. This is recorded as an external validation item, not hidden as a pass.

## Regression result

Phase 0 Foundation, Phase 1 Core Intelligence, Phase 2 Voice OS and Phase 3 visual/avatar/runtime tests all remained green in the Phase 4 gate.

## Next phase

Phase 5 — Multi-Agent Brain: Provider Registry, Model Router, health/fallback routing, task/result contracts, reviewer/conflict resolver and cost/latency-aware selection with ChatGPT as leader/supervisor.
