# Pink V23 — Living Spatial Interface

V23 turns the V22 spatial shell into a living, evidence-driven Mission Control without enabling camera access.

## Added
- dynamic orbital motion for registered spatial targets;
- depth-aware node scale/opacity/z-order;
- SVG links from Pink Core to each target;
- selected-node visual state;
- live HUD derived from runtime data only;
- Pink Core working/idle visual state based on real running tasks;
- spatial quality switch: Lite / Balanced / Ultra;
- particle budget derived from Spatial Kernel quality;
- tab visibility pause/resume;
- prefers-reduced-motion propagation into the Spatial Kernel;
- no camera start and no biometric identity storage.

## Evidence discipline
The HUD never invents agent activity. Agent count comes from the OS registry and mission activity comes from Task Runtime state.

## Inherited defect repaired
V22 browser smoke still expected next-0.9.0 while V22 runtime was next-0.11.0. V23 updates the test to the actual V23 runtime version and expands it to verify the live HUD, network links and quality control.

NO EVIDENCE → NO CLAIM.
