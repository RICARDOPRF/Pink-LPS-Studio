# Jarvis source integration record

Date: 2026-09-13
Project: Pink LPS Studio / Lean Performance Solutions

The project owner supplied seven Jarvis/assistant source archives during the Pink engineering session and explicitly stated that the Mark LIII author supplied the files for copying/reuse. The project owner then explicitly authorized integration into Pink. This record preserves that representation; it does not modify the public license text of any upstream project.

## Sources reviewed
- Mark-LIII-main.zip
- JARVIS-OS-V.2-main.zip
- jarvis-android-main.zip
- Jarvis-Desktop-Voice-Assistant-main.zip
- Omarvscape---Jarvis-main.zip
- jarvis-main.zip
- jarvis-main (1).zip

## Patterns integrated into Pink
- Local faster-whisper STT with VAD.
- Local Kokoro pt-BR TTS.
- Edge TTS no-key fallback.
- Ollama local chat endpoint.
- Optional openWakeWord model adapter.
- Audio interruption / barge-in primitive.
- Microphone/output device discovery.
- Local health and dependency probes.
- Browser-to-loopback Companion bridge.
- Explicit provider fallback rather than silent premium usage.

## Security boundary
Upstream desktop assistants contain subprocess/process-launching code and some shell-based operations. Those implementations are not exposed as an unrestricted Pink capability. Pink retains scoped capabilities, loopback-only local voice service, token-authenticated action endpoints, approval boundaries for external writes, and CI contracts forbidding `shell.execute` / `terminal.execute` capabilities.

## Wake-word truthfulness
openWakeWord support is present, but Pink will not claim a working custom phrase such as “Hey Pink” until a compatible wake-word model is configured and device-tested. The service intentionally returns `wake_model_not_configured` when no model is supplied.
