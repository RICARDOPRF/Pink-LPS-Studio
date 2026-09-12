# Pink Evolution Import 01 — Architecture extraction

Reference inspected: `JARVIS-OS-V.2` (MIT License). This branch does **not** execute or install the reference project and does not copy its dangerous execution paths.

## Concepts reimplemented for Pink

- **Awareness Engine:** current app/project/activity/goal/tool/last action plus bounded recent events.
- **Planner + Recovery:** small explicit plans, step state, retry budget, replan signal and approval boundaries.
- **Approval Engine:** PREPARE → APPROVE → CONSUME flow, action fingerprinting, expiration and risk classification.
- **Context Memory:** structured preferences/projects/decisions/lessons/notes with secret redaction and bounded browser persistence.
- **Health / Self-Test:** passive checks for secure context, media support, storage, WebSocket and Pink Evolution availability.
- **Runtime Adapter:** connects existing Pink state changes to awareness/evolution without changing production behavior.

## Deliberately excluded

- executing model-generated Python/JavaScript on the host;
- automatic package installation;
- unrestricted desktop control;
- scheduled-task/cron persistence;
- shutdown/reboot actions;
- destructive file operations;
- credentials or private API keys in browser code.

## Visual finding

The inspected hosted web UI uses a CSS-based reactor/orbit composition rather than a true Three.js 3D scene. Its premium feel comes from strong state-driven motion, composition, depth, glow and disciplined UI hierarchy. Pink can adopt those principles while moving to a genuinely 3D avatar later.

## Security note

`PinkApproval` in this static branch is an **interaction guard**, not a security boundary. Production authorization must be enforced server-side. The client cannot be trusted to protect GitHub, billing, credentials, deletion, or deployment operations.

## Next import targets

1. cloud-backed scoped memory;
2. server-side approval/audit service;
3. isolated dev sandbox/container;
4. planner backed by Pink + Gemini with typed tools only;
5. richer 3D presentation layer (separate visual track).
