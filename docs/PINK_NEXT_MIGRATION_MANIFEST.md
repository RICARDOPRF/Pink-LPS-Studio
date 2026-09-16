# Pink Next — Migration Manifest

Status: reconstruction branch only. Legacy production remains untouched.

## Principles

- Preserve data, provider connections, Supabase project, memories, people graph and verified contracts.
- Do not copy UI debt, global CSS sprawl or ad-hoc boot order.
- Private API keys remain in provider secret stores / Supabase Edge Function secrets. They are never copied into the browser app.
- Pink Next must use explicit contracts between UI, supervisor, task runtime, tools, memory and security.
- NO EVIDENCE → NO CLAIM.
- No merge to `main` and no production cutover without explicit human approval.

## Classification

### KEEP
- Supabase project and active Edge Functions (`pink-brain`, `pink-memory`, `pink-openai`, `pink-claude`, `pink-nvidia`, `pink-gemini-token`, `pink-gemini-reasoning`, `pink-vision`, `pink-health`).
- Production memory data and People/Project knowledge.
- Existing provider-side secrets and credentials.
- Approval/confirmation policy concepts.
- N5 human-approval requirement.
- Capability-awareness principle.
- Existing production application as rollback target.

### MIGRATE
- Memory Cloud → layered Memory V2 adapter.
- Tool Registry → progressive capability catalog.
- Confirmation Gate → host-level Approval Broker + Constraint Register.
- Observability → trace-first execution model.
- Autoevolution → trace/baseline/A-B/eval driven evolution.
- Voice/vision providers → typed provider adapters.
- Local Companion → future Pink Satellite.
- Projects/people memory → typed entities and provenance.

### REWRITE
- Entire visual shell and layout.
- Runtime bootstrap and module loading.
- Task orchestration and continuation.
- Context assembly.
- Skills engine and tool search.
- Multi-agent orchestration.
- Behavioral eval harness.

### DROP
- Global UI injection by feature modules.
- Feature-owned z-index systems.
- Direct provider calls from UI components.
- Implicit global state as the primary integration mechanism.
- Duplicate panels/modals that represent the same concept.
- Self-modification without measured baseline and human agreement.

## Migration gates

1. Pink Next must be independently bootable under `/apps/next/`.
2. Legacy app remains unchanged during reconstruction.
3. Every new phase adds contracts and non-destructive tests.
4. Data migrations are additive until cutover.
5. Production cutover requires functional parity, security review, browser tests, rollback plan and explicit approval.
