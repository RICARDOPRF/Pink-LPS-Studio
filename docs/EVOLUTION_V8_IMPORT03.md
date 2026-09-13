# Pink V8 — Import 03 integration plan

This branch starts from the current V7 `main`, preserving ElevenLabs voice, Pink Core people memory and current LPS routing.

## Phase A — safe foundations
- Provider health registry
- Memory curator/relevance gate
- Audio mode separation
- Device health telemetry

Acceptance: modules load without private keys, shell access, network side effects or mutation of existing Pink people memory.

## Phase B — visual presence
- Pink HUD Layer around `#pinkStage`
- state-reactive energy for idle/listening/thinking/speaking/executing/error
- no replacement of the Pink avatar

Acceptance: visual layer can be added/removed independently and does not interfere with microphone, ElevenLabs or Pink Core.

## Phase C — later backend capabilities
- provider router using GPT/Gemini/other approved providers
- Home Assistant connector with scoped permissions and confirmation policy
- cloud memory curator with provenance and user controls

Production merge remains approval-gated.
