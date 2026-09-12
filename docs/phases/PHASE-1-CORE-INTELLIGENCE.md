# Phase 1 - Pink Core Intelligence

## Goal
Make Pink understand context, plan work, recover from failure and improve safely.

## Modules
- Awareness Engine;
- Planner / Recovery / Replan;
- Approval Engine;
- scoped Context Memory;
- Evolution Core;
- Health / Self-Test;
- Run Ledger;
- Preflight diagnostics;
- Recall Gate.

## Acceptance criteria
- Pink can state current project, objective, action and last meaningful event;
- a multi-step goal has observable step states;
- failed steps end in retry/replan/blocked rather than hanging;
- risky actions require approval;
- memory retrieval is relevance-scoped;
- health status identifies major subsystem failure.

## Next work
Connect current modules to real tool execution and persistent backend storage while preserving isolation.
