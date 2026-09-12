# Pink Evolution Roadmap

This roadmap is the execution backbone for Pink. New references, archives, ideas and experiments must be assigned to a phase before implementation.

## Operating rule

Every evolution follows: **inspect -> classify -> clean-room rewrite -> isolate -> test -> review -> preview -> approve -> merge**.

Production rules remain strict: no autonomous merge to `main`, no credential exposure, no destructive action, no billing changes and no reduction of security controls without explicit approval.

## Phase map

| Phase | Name | Goal | Status |
|---|---|---|---|
| 0 | Safety & Provenance | Keep all imported ideas legally and technically safe | ACTIVE |
| 1 | Pink Core Intelligence | Awareness, planning, recovery, memory, health and approvals | IN PROGRESS |
| 2 | Pink 3D Presence | Replace retro/static feel with a premium 3D living interface | IN PROGRESS |
| 3 | Voice & Wake | Reliable `Olá Pink`, voice watchdog, echo guard and mobile behavior | PLANNED |
| 4 | Multi-Agent Brain | GPT coordinator + Gemini reviewer + specialist agents | IN PROGRESS |
| 5 | Pink Studio | Voice-driven software development with branch/diff/test/preview | PLANNED |
| 6 | Pink Memory Cloud | Persistent cross-device/project memory with scoped recall | PLANNED |
| 7 | Pink Companion | Controlled local/device capabilities with explicit permissions | FUTURE |
| 8 | Product & Enterprise | Multi-tenant, RBAC, audit, SSO, billing boundaries and deploy regions | FUTURE |

## Dependency chain

`0 -> 1 -> 2/3/4 -> 5 -> 6 -> 7 -> 8`

Phases 2, 3 and 4 can evolve in parallel after Phase 1 foundations are stable.

## Branch strategy

- `evolution/import-XX-*` - clean-room extraction from external references.
- `evolution/phase-N-*` - implementation work for a roadmap phase.
- `fix/*` - isolated defect correction.
- `main` - production only after explicit approval.

## Definition of done for any phase

A phase is only considered complete when:

1. acceptance criteria are documented;
2. risky actions have explicit gates;
3. code passes static checks and available tests;
4. Gemini or an independent reviewer checks the change when useful;
5. preview behavior is demonstrated;
6. regression risks are recorded;
7. production merge remains a separate explicit decision.

## Reference intake

All future ZIPs, repositories, screenshots or concepts go through `docs/REFERENCE_INTAKE.md` before code is reused or reimplemented.

## Current focus

Current priority is **Phase 1 + Phase 2**: make Pink operationally smarter while replacing the current retro/static presentation with a premium, reactive 3D presence.
