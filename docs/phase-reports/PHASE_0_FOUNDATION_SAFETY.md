# PHASE 0 — FOUNDATION & SAFETY

**STATUS:** PASS

## Commits

- **START COMMIT:** `78b07d98c19ef5db517e1769428fbb5399e02e6f`
- **IMPLEMENTATION GATE COMMIT:** `ef3b353e445736153933208eb628b6fe348f0a09`
- **BRANCH:** `phase/0-foundation-safety`
- **CI EVIDENCE:** Pink CI run `34732142691`

## Files changed

- `pink-public-config.js`
- `foundation/pink-foundation.js`
- `foundation/risk-policy.json`
- `foundation/dependencies.json`
- `docs/FOUNDATION_SECURITY.md`
- `scripts/secret-scan.cjs`
- `scripts/dependency-audit.cjs`
- `tests/foundation-safety.cjs`
- `tests/static-server.cjs`
- `tests/browser-smoke.cjs`
- `pink-evolution.js`
- `.github/workflows/pink-ci.yml`

## Features added

- Validated public-only runtime configuration and environment classification.
- Feature flags for roadmap capabilities.
- Risk classes: `READ_ONLY`, `REVERSIBLE`, `EXTERNAL_WRITE`, `DESTRUCTIVE`, `PRODUCTION`.
- Approval Engine base with action-bound approval.
- Run Ledger base with mandatory terminal states: `completed`, `failed`, `cancelled`, `timeout`, `blocked_external`.
- Secret redaction helpers.
- Repository secret scanner including Supabase JWT role inspection.
- Pinned dependency/license inventory and CI audit.
- Clean-room, branch, environment, secret, recovery and approval policies.
- Pinned Playwright Chromium browser smoke tests for desktop and mobile viewport.
- Additive Foundation boot that preserves the existing Pink runtime if the foundation layer cannot initialize.

## Bugs found and fixed

1. **Secret scan false positives in synthetic security fixtures.**
   - Cause: the scanner correctly recognized fake tokens intentionally used by tests.
   - Fix: only lines explicitly marked `pink-secret-scan-fixture` bypass scanning; the test directory remains scanned normally.

2. **Frozen Foundation API factory export.**
   - Cause: `Object.defineProperty` attempted to add `createFoundation` after the API object had been frozen.
   - Fix: factory reference is included before `Object.freeze`.

## Tests run

Pink CI `34732142691`:

- Secret scan — PASS
- Dependency/license audit — PASS
- JavaScript syntax — PASS
- Foundation safety contracts — PASS
- Presence lifecycle — PASS
- Avatar controller — PASS
- Avatar Supabase registry — PASS
- Avatar model adapter — PASS
- Avatar validation gate — PASS
- Voice reactive lip sync — PASS
- Holographic UI modes — PASS
- Adaptive performance governor — PASS
- Runtime health/avatar performance — PASS
- Playwright Chromium desktop smoke — PASS
- Playwright Chromium mobile (`iPhone 14` viewport/device profile) smoke — PASS

Browser evidence:

- `Browser smoke desktop: OK (eco)`
- `Browser smoke mobile: OK (eco)`

## Test totals

- **TESTS FAILED AT FINAL GATE:** 0
- **TEST GATE:** PASS

## Security findings

- No GitHub token pattern found in repository source.
- No OpenAI-style private key pattern found in repository source.
- No private key block found.
- Browser Supabase credential is validated as role `anon`; `service_role` JWTs are rejected by config validation and CI scanning.
- NVIDIA private API key remains server-side in Supabase Edge Function secrets by architecture.
- Client Approval Engine is an interaction guard; authoritative high-risk authorization must be server-side in later phases.

## Performance

No runtime performance regression was observed by the existing performance contract or browser smoke. The Phase 3 adaptive performance governor remains intact.

## Known limitations

- Playwright currently validates Chromium desktop/mobile emulation, not physical iOS Safari or Android Chrome hardware.
- Production server-side durable approvals/audit are deferred to later backend phases.
- Public config is additive; existing runtime constants are not yet fully deduplicated to minimize Phase 0 regression risk.

## External blockers

None for Phase 0.

## Next phase

**PHASE 1 — CORE INTELLIGENCE**
