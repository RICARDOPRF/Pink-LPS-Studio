# Phase 5 - Pink Studio

## Goal
Let the user build and improve applications through conversation with verifiable execution.

## Canonical workflow
`request -> inspect -> plan -> evolution/feature branch -> edit -> static checks -> tests -> preview -> explain -> approval -> merge/publish`

## Deliverables
- secure server-side GitHub/tool execution;
- repository/project selector;
- diff viewer;
- sandbox/container execution;
- test runner;
- live preview;
- before/after presentation;
- approval transaction for production.

## Acceptance criteria
- no GitHub private token in browser;
- generated code never executes directly on user machine;
- every change has branch + commit/diff traceability;
- failed tests block publication by default;
- production actions require explicit confirmation.
