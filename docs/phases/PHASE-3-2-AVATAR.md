# Phase 3.2 — avatar infrastructure

Base inspected: main `3256948a84a9898311d52e137284572166f1afc7`.

## Delivered in this candidate

`visual/avatar/controllers.mjs` provides AvatarController, AvatarLoader, AnimationController, FacialController, VisemeController, StateController and AudioReactiveController. No provider SDK, microphone access, memory writes or credentials are introduced into these controllers.

The existing presence renderer owns rendering and disposal. `runtime.mjs` connects the optional avatar to its scene and state. The portrait and simulated portrait overlays are hidden only after a model attaches successfully, and restored on failure/context loss/destruction. The default config has `url:null`: no model request or GLTFLoader import occurs, and the current Pink portrait remains the identity.

When a configured model supplies the mapped bones/morphs/clips, the controllers apply blinking, breathing, head/eye movement, state expressions and mapped animations. Procedural bone names are opt-in; do not also animate those bones in clips. Morph names must be verified against the actual asset. This is infrastructure, not a delivered or visually approved rig.

The ElevenLabs bridge reads the existing conversation's optional `getOutputVolume()` meter during speaking. It neither creates a conversation nor requests microphone access. Amplitude is approximate mouth opening, not phoneme recognition. Explicit timed viseme weights can be sent through `Pink3DPresence.pushVisemes(values,durationMs)`. Unsupported/missing audio meters and browser SpeechSynthesis currently leave the avatar mouth closed; a boundary-event adapter is pending. Stale audio/visemes expire. Reduced-motion uses the existing render-on-demand policy, so continuous mouth motion is also suppressed.

## Asset contract

In `visual/avatar/config.mjs`, supply only after review:

- `url`: same-origin `.glb`, no query, fragment, credentials or redirects.
- `license` and `source`: actual original/licensed model provenance; these fields document provenance, they do not independently verify legal rights.
- `scale`, `position`: placement in the existing camera scene.
- `bones`: exact node names for head, leftEye and rightEye (optional).
- `animations`: state to exact animation clip name (optional).
- `morphs`: channel to actual morph names (optional).

Only self-contained GLB v2 with bufferView resources is accepted. URI dependencies, VRM and required extensions are rejected in this adapter. VRM needs a separate reviewed adapter; it is not supported by renaming its extension. Download maximum is 20 MiB and load deadline is 15 seconds; late parsed models are disposed after timeout/cancellation. LoadingManager rejects external dependency URLs. The GLB parser itself runs on the browser thread; the deadline cannot preempt synchronous parsing, so assets still require offline review and mobile optimization.

Pinned Three.js stays at 0.160.0; the import map makes GLTFLoader and the existing renderer use the same module. Documentation references: https://threejs.org/docs/#examples/en/loaders/GLTFLoader and https://threejs.org/docs/#api/en/animation/AnimationMixer.

## Verification and limitations

Run from repository root:

```
node tests/avatar-controllers.mjs
node tests/presence-lifecycle.cjs
node --check visual/avatar/controllers.mjs
node --check visual/avatar/runtime.mjs
node --check visual/pink-3d-presence.js
```

Passed locally: controller contracts, stale samples, morph mapping/reset, invalid/remote/oversized assets, parse timeout and late disposal, avatar lifecycle; existing presence scheduling/fallback lifecycle also passed with a mock renderer.

Not verified: real GLB rendering, GPU, production CDN module resolution, iOS/Android appearance, actual bone orientation, live ElevenLabs or fallback voice. No GLB/VRM is included. No avatar preview or final visual approval is claimed. Main voice/Core/NVIDIA/routers are unchanged. This candidate remains off production until approval; Phase 3 remains incomplete.
