# Pink LPS Studio Next — Target Architecture

## Product modes

- **Pink Only** — voice-first assistant surface.
- **Pink + Screen** — compact Pink presence while operating tools/browser/desktop.
- **Command Center** — tasks, plans, evidence, tools, memory, traces and evolution.

## Runtime path

`UI → Supervisor → Task Runtime → Capability Router → Approval Broker → Constraint Register → Tool/Skill → Provider → Trace`

No UI component may call a private provider directly.

## Packages

- `contracts`: stable runtime enums, task/tool/evidence contracts.
- `core`: event bus, lifecycle and dependency composition.
- `task-runtime`: persistent plans, checkpoints, pause/resume and task state.
- `memory`: layered memory model and adapters.
- `context`: bounded context compiler.
- `tools`: progressive capability catalog and tool search.
- `skills`: reusable procedures composed from tools.
- `security`: constraints, risk calculation and approval tokens outside the LLM.
- `observability`: traces and measurable execution outcomes.
- `agents`: supervisor/subagent policy.
- `evolution`: baseline → candidate → human agreement → experiment → eval → draft PR.

## Security invariants

1. The LLM cannot lower a host-assigned risk level.
2. Final risk is the maximum of manifest risk, host risk, payload risk and source-trust risk.
3. Critical constraints are evaluated mechanically outside model context.
4. External tool/web content is untrusted data, not instruction.
5. Approval is scoped, time-limited and single-use where possible.
6. Secrets never enter browser bundles, traces or model prompts.
7. Production publication and main-branch merge are never autonomous.

## Phase map

0. Inventory + migration manifest
1. Foundation + contracts + event bus
2. New design system/UI shell
3. Task Runtime + continuation
4. Memory V2 + Context Compiler
5. Capability Router + Tool Search + Skills
6. Approval Broker + Constraint Register + Trust Boundary
7. Traces + Behavioral Evals + A/B metrics
8. Pink Satellite contract
9. Voice/vision provider contracts
10. Multi-agent Supervisor
11. Pulse + Self Model contracts
12. Autoevolution 2.0 + Skill Discovery
13. Security/performance hardening
14. Migration/cutover gate

## Cutover rule

Pink Legacy stays production until Pink Next demonstrates functional parity, green browser/eval/security gates and an explicit human approval to publish.
