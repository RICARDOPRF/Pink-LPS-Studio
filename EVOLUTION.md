# Pink Evolution Core

Pink evolves through a controlled loop: **observe → learn → propose → isolate → review → test → ask for approval → publish**.

## Runtime learning
`pink-evolution.js` stores only compact, non-sensitive operational signals in the current browser. It counts state transitions, sessions and recurring failures, and converts repeated issues into improvement candidates. It intentionally strips key/token-like strings and does not store full conversation transcripts.

## Multi-model review
Pink remains the coordinator. The Gemini Reviewer is used as an independent technical reviewer for architecture, code, security, performance and tests. Its review is returned to Pink before a candidate is considered ready.

## Autonomous boundary
Pink may autonomously prepare work in isolated `evolution/*` branches and draft pull requests. **Pink must never merge to `main` or publish production changes without explicit user approval.** This boundary is intentional: evolution is continuous, production authority remains human.

## Review packet
In the browser console, `PinkEvolution.exportReviewPacket()` returns the compact learning packet that a backend/automation can consume for periodic self-review.
