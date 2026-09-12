# Pink Evolution — Import 02

This import is a clean-room implementation based on behaviors observed across four Jarvis reference archives.

## Added

- `visual/pink-neural-field.js`: real Three.js/WebGL particle field around Pink, driven by `#pinkStage[data-state]`.
- `core/voice-watchdog.js`: mic RMS telemetry and recognizer-stall detection; never requests permission itself.
- `core/echo-guard.js`: prevents Pink's own TTS from retriggering voice commands.
- `core/run-ledger.js`: autonomous jobs are bounded and end in explicit terminal states.
- `core/recall-gate.js`: relevant-memory selection instead of dumping all memory into every task.
- `core/preflight.js`: read-only browser capability/health checks.
- `docs/JARVIS_IMPORT_02_SECURITY.md`: hashes, license boundaries and static security findings.

## Visual direction

The reference projects demonstrate two useful patterns: a real WebGL particle field and state-specific visual behavior. Pink keeps her female android identity; the neural field is environmental energy around her, not a replacement orb.

The target V4 experience remains: **Pink is the screen**. Workspaces, apps and diagnostics appear only when requested.
