# Pink V16 — Multi-Agent Orchestrator

## Goal

Turn Pink's specialist agents into a governed team with one orchestration owner, bounded delegation, independent verification, controlled retries, durable checkpoints, and explicit run budgets.

This is a clean-room implementation. No third-party agent code is copied.

## Reference patterns reviewed

- OpenAI Agents SDK: manager-owned orchestration, agents-as-tools vs handoffs, guardrails, and tracing.
  - https://openai.github.io/openai-agents-python/multi_agent/
  - https://openai.github.io/openai-agents-python/guardrails/
  - https://openai.github.io/openai-agents-python/tracing/
- LangGraph: explicit workflow nodes, durable checkpoints, retry policies, recovery paths, and human interruption.
  - https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph
- Microsoft AutoGen: selector/team patterns and hard termination conditions such as max turns, token use, timeouts, and handoff termination.
  - https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/selector-group-chat.html
  - https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/tutorial/termination.html

## Pink-specific design

Pink keeps a Supervisor as the orchestration owner. Specialists do bounded subtasks and return evidence to the Supervisor. A separate Verifier role reviews the collected results before the Task Runtime may reach completed state.

### Safe parallelism

Only consecutive agents whose policy is READ_ONLY can share a parallel wave. Mutating or LOW/MEDIUM-risk roles stay serialized. This prevents a latency optimization from becoming an uncontrolled side-effect fan-out.

### Handoffs

Every specialist execution starts with a governed Supervisor → Specialist handoff and returns through Specialist → Supervisor. The Verifier has its own explicit route. Handoff context remains bounded and passes through V15 redaction/guardrail rules.

### Retries and revision

Transient specialist failures may retry only up to the per-step limit. If independent verification rejects a result, only the roles named by the verifier may run a correction round. Correction rounds are also bounded.

### Termination and budgets

Each run has hard limits for:
- agent executions;
- retries per step;
- verification correction rounds;
- tool calls;
- tokens;
- estimated cost;
- total elapsed time;
- per-step elapsed time.

Budget exhaustion blocks the durable task instead of silently continuing.

### Independent verification

The built-in deterministic verifier requires:
- every specialist result to be successful;
- every result to provide a bounded summary;
- every mutating specialist to provide evidence references.

A dedicated Verifier executor can replace this deterministic verifier while remaining READ_ONLY and behind the same handoff/output guardrails.

### Durable state and observability

The Task Runtime now has an explicit BLOCKED transition and checkpoint. The orchestrator records agent attempts, handoffs, verification events, spans, usage, and final status in the existing trace system.

## Promotion rules

- Work remains in `evolution/*` until CI is green.
- No automatic merge to `main`.
- No production publish, credential mutation, billing change, security weakening, or destructive data action.
- NO EVIDENCE → NO CLAIM.
