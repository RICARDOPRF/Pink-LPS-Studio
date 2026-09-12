# Jarvis Reference Import 02 — static security & provenance

Date: 2026-09-12

The following archives were inspected statically. No project code was executed.

| Archive | SHA-256 | License observed | Pink policy |
|---|---|---|---|
| `jarvis-main.zip` | `4d157b381841d4759facf407a9365f1b8d352b10966a40a1ccaa29f150487ebd` | non-commercial | concepts only; clean-room rewrite |
| `jarvis-main (1).zip` | `827db33cddbb3907a162e608f7486c2a3fa3886c33bb5446cafca5f66b7817cb` | personal/non-commercial | concepts only; clean-room rewrite |
| `Jarvis-Desktop-Voice-Assistant-main.zip` | `a7ca3d8c94998e6ab909dcac870d620ee09183f11dd1cab6eac114f5d109d344` | MIT | code could be reused legally, but implementation is too old/basic for Pink |
| `jarvis-android-main.zip` | `4de4801f9d5379bf44f62430ac1dafdb80e1fb7a480d54d999e3b7e499b46f92` | proprietary | architecture/UX concepts only; no source copying |

## Security observations

No clear malware payload, reverse shell, hidden executable, or credential exfiltration routine was identified in the static pass. That is not a guarantee of safety and dependencies were not executed.

High-risk capabilities found in the references:
- process spawning and permission-bypass modes in the Claude-driven desktop project;
- desktop automation / shutdown in the older desktop assistant;
- Android permissions for overlay, boot receive, SMS, calls, notification access and broad package visibility;
- a compiled Python email helper containing SMTP/login functionality;
- an embedded Google Maps key in the Android tree;
- remote HTTP backends and multiple third-party APIs.

Pink does **not** inherit those capabilities automatically.

## Clean-room ideas accepted for Pink

1. WebGL neural presence reacting to Pink states and audio.
2. Passive microphone health watchdog.
3. Echo suppression so Pink does not wake on her own speech.
4. Every autonomous run must reach a terminal state.
5. Memory recall gate: inject only relevant context.
6. Read-only preflight/diagnostic checks.
7. Future native app: foreground wake-word service only with explicit OS permission.

## Explicitly rejected

- `--dangerously-skip-permissions` style autonomous execution.
- arbitrary generated code execution on the host.
- automatic package installation outside a sandbox.
- privileged phone/SMS/overlay behavior without explicit per-capability approval.
- copying proprietary/non-commercial source into Pink.
