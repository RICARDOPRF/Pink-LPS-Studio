# Phase 7 - Pink Companion

## Goal
Enable carefully permissioned local/device actions without turning Pink into unrestricted remote code execution.

## Possible capabilities
- open approved applications;
- read explicit local project folders;
- screen-aware assistance with consent;
- notifications;
- local wake service;
- controlled clipboard/window interactions.

## Security model
- allowlisted capabilities;
- per-action permission scopes;
- visible local activity log;
- no arbitrary shell by default;
- no silent persistence;
- no unrestricted file deletion;
- kill switch and revoke controls.

## Acceptance criteria
A compromised prompt cannot silently gain broader local privileges than the user granted.
