# Import 03 — Omarvscape Jarvis → Pink V7 clean-room study

## Source reviewed
- Archive: `Omarvscape---Jarvis-main.zip`
- SHA-256: `3c5acca2ccccf3153f3dfb50e46b505810fe92f0d168261e3e8fabc1300b0333`
- Files in archive: 36
- Review method: static inspection only. Nothing from the archive was executed.

## Security result
No clear evidence of a virus, credential stealer, reverse shell, obfuscated payload, or hidden executable was found in the reviewed archive.

Important capabilities/risk surfaces found:
- `setup.py` can install Python requirements when intentionally run.
- `hud.py` uses `subprocess.run` to query GPU/temperature utilities. The `self._app.exec()` occurrence is the Qt event loop, not arbitrary Python `exec`.
- the Windows PowerShell call only queries a WMI temperature value in the inspected code.
- `pi_device.py` can run local Linux audio/Bluetooth shell commands and contains a hard-coded speaker MAC address.
- README documents optional Linux desktop autostart.
- Home Assistant integration can control `light` and `switch` entities using a long-lived bearer token.
- OpenRouter and Gemini send prompts/data to external model providers when configured.
- no real API key was present in `.env.example`; values are placeholders.

These capabilities are legitimate for the stated Raspberry Pi assistant but are not copied into Pink's browser runtime.

## License/provenance
No LICENSE file or explicit software license grant was present in the archive. Therefore source code is not copied into Pink. Only architectural ideas are used, with new clean-room implementations.

## Ideas adopted for Pink
1. Provider health/fallback registry with cooldown after failures/rate limits.
2. Two-stage memory curation concept: relevance gate first, bounded durable memory second.
3. Separate assistant-listening mute from speaker-output mute.
4. Browser-safe device/runtime health telemetry.
5. State-reactive HUD around the existing Pink avatar: rings, scanners, pulse, particles and different energy per state.
6. Future option: Home Assistant integration, but only server-side/permissioned and with explicit action approval.

## Explicitly not copied
- Raspberry Pi shell commands.
- hard-coded device addresses.
- autostart persistence.
- direct bearer tokens or local `.env` handling in the public frontend.
- source code from the reference archive.
