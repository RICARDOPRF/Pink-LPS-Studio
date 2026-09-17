# Pink V15 — Handoffs, Guardrails and Trace Spans

## Goal

Add explicit, bounded agent-to-agent transfers and deterministic safety checks without importing third-party runtime code or enabling generic shell/desktop autonomy.

## Clean-room reference patterns

Reviewed architectural ideas from current agent frameworks:

- OpenAI Agents SDK: explicit handoffs, input filtering, input/output/tool guardrails and hierarchical tracing.
- Microsoft Agent Framework: enterprise multi-agent orchestration and typed interoperability patterns around A2A/MCP.
- Letta: long-lived stateful-agent direction remains a reference for future memory evolution; V15 does not change persistent user memory semantics.

Only general architectural patterns were reimplemented. No third-party source was copied.

## V15 changes

- `GuardrailPipeline` with deterministic pass/review/block decisions.
- block mutating tool calls that originate directly from untrusted external content.
- block secret-like values at handoff/tool-output/final-output egress boundaries.
- bound oversized agent context and require review instead of silently forwarding it.
- `HandoffBroker` with explicit role routes, destination risk caps, bounded summaries and evidence references.
- handoff context strips raw histories/transcripts and redacts secret-bearing keys.
- trace events for accepted/rejected handoffs and guardrail tripwires.
- hierarchical trace spans with parent relationships and duration/status metrics.
- Pink Next runtime exposes the Agentic kernel, guardrails and handoff broker as first-class components.

## Deliberately excluded

- unrestricted peer-to-peer agent routing;
- arbitrary shell execution;
- autonomous production deploy or merge;
- copying full conversation history between agents;
- secret propagation between agents;
- automatic write actions derived directly from untrusted web/tool content.

## Acceptance gates

- syntax and dependency/license checks remain green;
- existing Pink/Legacy browser tests remain green;
- Windows Satellite build/self-test remains green;
- new V15 contract tests cover untrusted-write tripwire, secret egress, context filtering, route/risk rejection and trace spans.
