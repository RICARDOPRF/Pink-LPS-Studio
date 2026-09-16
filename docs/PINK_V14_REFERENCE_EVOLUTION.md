# Pink V14 — Reference Evolution / Agent Harness

Date: 2026-09-16
Status: lab branch only — no production deployment

## Goal

Consolidate proven assistant/agent patterns into Pink without copying unsafe or license-unclear source code. V14 is a clean-room implementation built on Pink's existing Foundation, Memory, Tool Registry, AI Gateway, Companion and Observability layers.

## Public reference patterns reviewed

The review considered public JARVIS / local-assistant / agent projects and current voice-agent architectures, including OpenJarvis, multiple JARVIS desktop assistants, JarvisOS/Project-JARVIS, Mimir-style local assistants, LiveKit voice-agent patterns, and God's Eye View-style realtime situational interfaces.

Patterns selected for Pink:

- typed capabilities instead of arbitrary shell execution;
- event bus for traceable cross-module signals;
- plugin/skill lifecycle with health state;
- circuit breaker after repeated provider/plugin failures;
- scoped, single-use human approval for writes;
- read/write risk separated per capability;
- bounded audit/event history with secret redaction;
- persistent memory with provenance and selective retention;
- explicit camera/vision opt-in;
- provider fallback with observable health;
- barge-in/interruption as a voice design requirement;
- human review before autonomous code reaches main.

Patterns explicitly rejected:

- unrestricted shell/terminal capability;
- silent package installation;
- self-deployment to production;
- automatic merge to main;
- credential rotation/exposure by an autonomous agent;
- destructive data operations without explicit human control;
- biometric identity inference from camera frames;
- claiming an external provider works when it has not been runtime-tested.

## V14 implementation

`runtime/pink-agent-harness.js` introduces:

1. **EventBus** — bounded, redacted events and observability forwarding.
2. **ApprovalBroker** — read-only calls are allowed; reversible/external writes need a scoped UI confirmation; destructive/production calls remain blocked at this autonomous layer.
3. **PluginManager** — typed capabilities, adapter lifecycle, health and audit events.
4. **CircuitBreaker** — repeated plugin errors open a temporary circuit instead of retrying indefinitely.
5. **Pink Tool bridge** — existing Tool Registry capabilities become V14 plugins without duplicating adapters.

The existing Tool Registry now evaluates risk by capability, so a mixed connector can expose safe reads without treating every operation as a write.

The confirmation gate now passes a single-use context containing `approvalSource`, `confirmationId`, `actionId` and timestamp to the exact callback that was confirmed. Generic `approved: true` values do not satisfy the V14 broker.

## Existing Pink capabilities preserved

V14 intentionally preserves the current:

- Pink Brain / multi-provider gateway;
- NVIDIA Nemotron reasoning bridge;
- ChatGPT, Gemini and Claude provider definitions/fallback paths;
- Memory & People Graph;
- Pink Vision opt-in camera path;
- local Companion voice service;
- 3D/orb interface;
- Pink Studio / Engineering Evolution;
- Supabase-backed cloud memory;
- observability and enterprise governance.

## NVIDIA native voice gate

NVIDIA's current voice-agent stack supports the architecture Pink wants: streaming ASR -> LLM -> streaming TTS with endpointing and interruption/barge-in. Pink already has an NVIDIA reasoning bridge, but this repository does not currently version the deployed `pink-brain` / `pink-nvidia` backend implementations and does not contain a deployed NVIDIA ASR/TTS Edge Function.

Therefore V14 does **not** claim NVIDIA-native speech is production-ready. The safe next evolution is to version the server-side speech adapters, keep the NVIDIA key server-side, add contract tests with mocked NIM responses, then run an authorized live device test before changing the production voice provider.

## Governance

N5 may discover, code, test, create a branch and open a Draft PR. It must not automatically merge to main. V14 includes the human-approval N5 policy as part of the consolidated evolution.

## Acceptance

V14 is acceptable only when:

- syntax and contract suites pass;
- Memory & People Graph contract passes against its real runtime version;
- scoped approval contract passes;
- Tool risk contract passes;
- Agent Harness contract passes;
- N5 policy proves no automatic merge command;
- Companion self-test passes;
- desktop/mobile browser smoke passes in GitHub Actions;
- no secret scan or dependency/license audit fails.

No production deployment and no main merge are part of this branch.
