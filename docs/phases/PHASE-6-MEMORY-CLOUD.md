# Phase 6 - Pink Memory Cloud

## Goal
Give Pink persistent, scoped memory across devices, sessions and projects.

## Memory classes
- identity-safe preferences;
- project context;
- decisions;
- learned workflow patterns;
- approved improvements;
- incidents/regressions;
- temporary working memory.

## Deliverables
- server-side memory store;
- per-user/per-project scopes;
- semantic retrieval;
- retention controls;
- delete/export controls;
- memory confidence/source metadata.

## Acceptance criteria
- switching device does not lose approved project memory;
- irrelevant memory is not injected into prompts;
- secrets are excluded/redacted;
- user can inspect/delete stored memory;
- project isolation is enforced.
