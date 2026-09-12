# Phase 2 - Pink 3D Presence

## Goal
Turn Pink from a site with an avatar into a premium living AI presence.

## Experience target
Home screen shows Pink as the product. UI appears only on demand.

## Deliverables
- original Three.js/R3F scene;
- Pink neural field / particles / depth;
- camera and parallax response;
- visual states: idle, listening, thinking, speaking, executing, reviewing, presenting, error;
- audio-reactive energy;
- mobile performance tiers;
- later: original rigged VRM/GLB Pink avatar with facial blendshapes and visemes.

## Acceptance criteria
- 3D scene is real WebGL, not only CSS perspective;
- graceful fallback on weak/mobile devices;
- state changes are visually obvious without dashboard clutter;
- Pink remains the visual center;
- no copied Jarvis branding/assets/shaders from restricted sources.

## Current state
Original `visual/pink-neural-field.js` staged in evolution branch.
