# Pink V25 — Agent Mesh Spatial

V25 exposes the governed multi-agent system inside Pink Spatial OS.

## Runtime model
- nodes come from the canonical AgentRole registry;
- states come only from real trace spans: idle, executing, reviewing, success or error;
- links come from audited handoffs;
- message types are FINDING, PROPOSAL, CHALLENGE and QUESTION;
- FINDING/PROPOSAL/CHALLENGE require evidence references;
- QUESTION may be recorded without evidence because it is not a claim;
- no synthetic agent activity is created when no trace exists.

## Spatial UI
Selecting Agent Mesh opens a spatial panel with:
- eight agent nodes;
- live state labels;
- evidence-backed message feed;
- empty state: SEM MENSAGENS COM EVIDÊNCIA;
- close action that returns to Mission Control without executing anything.

The view is read-only. It visualizes current runtime state and never grants a new tool permission.

NO EVIDENCE → NO CLAIM.
