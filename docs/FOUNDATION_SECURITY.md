# Pink LPS Studio — Foundation & Safety

## Baseline

Phase 0 starts from the verified Phase 3 baseline. Phase branches must be created from the current `main`, not from stale copies. Before a phase changes code, record the start commit and run the existing regression suite. After the phase, rerun the same suite plus the phase-specific gate.

## Branch strategy

- `main`: published production source.
- `phase/*`: roadmap phases.
- `feature/*`: bounded product features.
- `evolution/*`: controlled evolutionary changes.
- `lab/*`: experiments that must not be treated as production evidence.

Useful branches are retained until the corresponding validation is complete. Production merges require evidence from CI and a mergeable PR.

## Environment separation

Runtime environments are classified as `development`, `preview`, or `production`. Public configuration is isolated in `pink-public-config.js` and contains only browser-safe identifiers/endpoints. Private credentials belong in provider secret stores (for example Supabase Edge Function secrets) and must never be emitted into browser bundles, logs, URLs or localStorage.

## Secret policy

Forbidden in public source/browser runtime:

- Supabase `service_role` JWTs;
- private provider API keys;
- GitHub personal/access tokens;
- passwords;
- private keys;
- OAuth client secrets.

A Supabase `anon`/publishable key is permitted because it is designed for browser clients; RLS remains the authorization boundary. CI decodes JWT-like values and fails if a `service_role` role is found.

## Risk classes

- `READ_ONLY`: observation/query with no external mutation.
- `REVERSIBLE`: bounded change with a deterministic rollback path.
- `EXTERNAL_WRITE`: mutation in an external system; explicit approval required.
- `DESTRUCTIVE`: deletion/irreversible mutation; explicit approval required.
- `PRODUCTION`: release or critical production mutation; explicit approval required.

Billing, credentials, permission escalation and security weakening always require explicit approval even when another authorization exists.

## Approval flow

`PREPARE -> PREVIEW -> VERIFY -> APPROVE -> EXECUTE -> VERIFY -> AUDIT`

The Phase 0 Approval Engine base enforces risk classification and action-bound approval tokens. Later phases extend it with durable records and user/session identity.

## Run Ledger

Every execution has one terminal state:

- `completed`
- `failed`
- `cancelled`
- `timeout`
- `blocked_external`

Runs may not remain indefinitely in `running`; timeout handling is mandatory. Evidence is attached before claims are made.

## Clean-room policy

Only use source/code/assets that are original, explicitly licensed for the intended use, or created specifically for Pink. External projects may be studied for concepts, but proprietary implementation/assets are not copied. Licenses and provenance must be recorded when dependencies or assets are introduced.

## Backup and recovery

Git history is the code recovery source. Each production-changing PR must preserve a known-good pre-merge commit. Database changes must use migrations and reversible/down strategies where practical. Destructive production operations are outside autonomous authorization. Provider outages should degrade to safe read-only/fallback modes instead of corrupting state.

## Browser safety

The browser is not a trusted secret store. `localStorage` is allowed only for non-secret temporary state and legacy fallback data. High-risk writes are never authorized solely from client state.

## Phase 0 gate

The phase can only close after:

- existing Pink regression suite passes;
- syntax checks pass;
- configuration validation passes;
- secret scan passes;
- dependency/license inventory validation passes;
- Approval Engine/Run Ledger tests pass;
- security architecture review has no unresolved critical finding.
