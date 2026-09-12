# Phase 0 - Safety & Provenance

## Goal
Create a permanent safety and legal boundary around Pink evolution.

## Deliverables
- static inspection checklist for every external archive;
- source/license register;
- secret scanning and no-client-secret policy;
- prohibited capabilities list;
- clean-room rewrite policy;
- production approval gate.

## Acceptance criteria
- no imported executable is run during inspection;
- every external source has a provenance status;
- no private key is committed client-side;
- no `exec/eval` fallback for AI-generated code;
- no autonomous production merge.

## Current state
Foundation exists in Evolution Core and Jarvis import security notes. Continue for every new reference.
