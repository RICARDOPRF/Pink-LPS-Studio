# Phase 3 - Voice & Wake

## Goal
Make `Olá Pink` reliable and natural across desktop and mobile constraints.

## Deliverables
- wake phrase layer while page/app is active;
- one-time permission onboarding;
- iOS-safe user gesture flow;
- Voice Watchdog;
- Echo Guard;
- conversation lifecycle and reconnect logic;
- latency telemetry;
- explicit microphone privacy state.

## Acceptance criteria
- wake phrase does not start duplicate calls;
- Pink does not repeatedly hear her own TTS;
- stuck recognizer is detected and recoverable;
- microphone permission failures have clear recovery paths;
- wake detection does not expose private API keys in the client.
