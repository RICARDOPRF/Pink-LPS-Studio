# Reference Intake Protocol

Use this process for every external Jarvis/AI project, ZIP, repository, UI or code sample sent for Pink evolution.

## 1. Static safety inspection

Do not execute unknown code. Inspect for:
- shell/process execution;
- generated-code execution (`exec`, `eval`, dynamic Python/JS);
- downloads or payload staging;
- persistence (startup tasks, cron, launch agents, boot receivers);
- credential/token collection;
- unrestricted filesystem or desktop control;
- hidden binaries/obfuscation;
- dangerous mobile permissions.

## 2. License/provenance classification

Classify as one of:
- `SAFE_TO_REUSE` - compatible license confirmed;
- `CLEAN_ROOM_ONLY` - non-commercial, proprietary, unclear or restricted license;
- `DO_NOT_USE` - unsafe, malicious or legally incompatible.

## 3. Feature extraction

For useful ideas record:
- source concept;
- Pink phase;
- user benefit;
- security risk;
- implementation approach;
- acceptance test.

## 4. Clean-room implementation

When reuse is not allowed, only architecture/behavior may inspire the implementation. Pink code must be written independently with Pink naming, Pink UX and Pink security rules.

## 5. Integration gate

New modules first enter an `evolution/*` branch and draft PR. No direct production import.

## Intake labels

Use these tags in documentation:
`VISUAL_3D`, `VOICE`, `WAKE`, `MEMORY`, `PLANNER`, `AGENT`, `AUTOMATION`, `SECURITY`, `MOBILE`, `DESKTOP`, `TESTING`, `ENTERPRISE`.
