# Pink V24 — Camera Spatial Presence

V24 connects explicit camera presence to the Pink Spatial Kernel.

## Behavior
- camera remains OFF by default;
- user must press CAM OFF to request browser camera permission;
- reuses PinkVision getUserMedia lifecycle;
- MediaPipe Face Landmarker runs in the browser and only normalized transient pose is sent to the Spatial Kernel;
- no face identity, face recognition or biometric template is stored;
- head movement drives spatial parallax and Pink Core orientation;
- stopping presence returns the kernel to pointer mode;
- if the camera was already active for another Pink feature, disabling Spatial Presence does not stop that pre-existing stream;
- failure to load MediaPipe or permission denial falls back to pointer/touch.

## Upstream
MediaPipe Tasks Vision Face Landmarker model:
`face_landmarker/float16/1/face_landmarker.task`

The integration follows the existing Pink Orb pattern and keeps the external dependency lazy-loaded only after explicit user activation.

NO EVIDENCE → NO CLAIM.
