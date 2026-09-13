# PHASE 1 — CORE INTELLIGENCE

**STATUS:** PASS

## Commits

- **START COMMIT:** `9e5e960f1b9227a430479191a2d9cf73283f153e`
- **IMPLEMENTATION COMMIT:** `5541437738c593a75649f50f9cfc6de40b4c05b6`
- **BRANCH:** `phase/1-core-intelligence`
- **CI EVIDENCE:** Pink CI run `34732535950`

## Files changed

- `core/pink-operating-core.js`
- `tests/core-intelligence.cjs`
- `tests/browser-smoke.cjs`
- `index.html`
- `.github/workflows/pink-ci.yml`

## Features added

- Pink Awareness Engine tracking active project/context, goal, task, agent, tool, branch, preview, last action, last verified action and last error.
- Context Manager with context history and active-project synchronization.
- Task Manager with explicit state machine and mandatory terminal states.
- Error Manager and Health Engine.
- Capability Registry that accepts only pre-registered typed capabilities.
- Planner that marks plans invalid when a capability is unknown; it cannot invent shell/Python/tools.
- Executor integrated with Phase 0 Approval Engine and Run Ledger.
- Recovery Engine with bounded timeout/retry/fallback.
- Replan Engine after failed capabilities.
- Correct highest-risk aggregation for plan audit metadata.
- Browser boot integration as `window.PinkOperatingCore`.
- Safe default read-only capabilities: `context.snapshot` and `health.snapshot`.
- UI/runtime event integration for context switching and visual health.

## Bugs found and fixed

1. **Plan risk summary originally only elevated to PRODUCTION.**
   - Fix: risk rank now records the highest risk among READ_ONLY, REVERSIBLE, EXTERNAL_WRITE, DESTRUCTIVE and PRODUCTION.

## Tests run

Pink CI `34732535950`:

- Secret scan — PASS
- Dependency/license audit — PASS
- JavaScript syntax — PASS
- Foundation Safety contracts — PASS
- Core Intelligence contracts — PASS
- Existing Phase 3 regression suite — PASS
- Playwright Chromium desktop smoke — PASS
- Playwright Chromium mobile smoke — PASS

Core contract coverage:

- planner valid/invalid plans
- unknown capability rejection
- context switching
- task state machine
- bounded retry
- provider/capability fallback
- timeout
- automatic replan
- external write blocked without approval
- action-bound approval success
- cancellation
- no stuck Run Ledger execution
- health/error snapshots

## Test totals

- **TESTS FAILED AT FINAL GATE:** 0
- **TEST GATE:** PASS

## Security findings

- Executor cannot run arbitrary model-generated code or unknown tools.
- External writes continue to require Phase 0 approval semantics.
- No new secrets or privileged credentials introduced.

## Performance

Core Intelligence is dependency-free and event/state driven. Existing desktop/mobile browser smoke passed without UI regression.

## Known limitations

- Planner currently consumes explicit registered capability steps; semantic model-driven plan generation is added later behind the same capability registry.
- Run Ledger is currently browser-memory based; durable cloud audit belongs to Phase 4/10.
- Default production capability set intentionally remains minimal until Tools Layer phases.

## External blockers

None for Phase 1.

## Next phase

**PHASE 2 — VOICE OS**
