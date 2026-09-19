# Pink V21 — Spatial Kernel

V21 adds the deterministic interaction kernel for the future spatial interface without replacing the current UI.

- pointer/touch/keyboard spatial input
- opt-in camera state contract
- normalized head-pose input for parallax
- Lite / Balanced / Ultra budgets
- reduced-motion support
- spatial target registry for Pink Core, Mission Control, Agent Mesh, Nexora, CVM, Security and Evolution Lab
- target selection produces non-executing events (execute:false)

Camera access is never started by this package. A UI adapter must obtain explicit browser permission and may then feed normalized pose data. No face identity or biometric template is stored.

NO EVIDENCE → NO CLAIM.
