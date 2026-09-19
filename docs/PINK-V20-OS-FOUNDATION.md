# Pink V20 — OS Foundation

V20 introduces a small governed kernel for the future Pink Spatial OS. It does not install external projects and does not grant new execution privileges.

## Contracts
- App Registry: modules can be registered without coupling them to the core.
- Capability Registry: every action declares a risk level and permissions.
- Agent Registry: agents reference known capabilities.
- Action plans are non-executing by construction (execute:false).
- MEDIUM/HIGH/CRITICAL capabilities require approval.
- Mission Control, Agent Mesh and Evolution Lab are registered as initial shell apps.
- projectScoped and sandboxed are explicit app/agent properties.
- evidence references travel with registry entries and planned actions.

## Safety boundary
V20 is architecture/governance only. It does not enable webcam, shell, computer control, deployment, credentials, billing, robotics, trading, game automation, CAD mutation or production changes.

NO EVIDENCE → NO CLAIM.
