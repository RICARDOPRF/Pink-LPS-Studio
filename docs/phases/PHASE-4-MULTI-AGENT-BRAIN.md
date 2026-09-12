# Phase 4 - Multi-Agent Brain

## Goal
Make Pink the coordinator of specialist AI brains while preserving one unified persona.

## Initial topology
- Pink / GPT - primary coordinator;
- Gemini Reviewer - independent technical review;
- future specialist agents: Developer, UI/UX, Test, Security, Research, Planning, Reports.

## Rules
- agents do not publish production independently;
- handoffs must preserve relevant context;
- specialist output is advisory until verified by tools/tests;
- the user normally sees one Pink, not agent clutter.

## Acceptance criteria
- Pink can invoke Gemini for a technical second opinion;
- reviewer returns risks, recommendations and tests;
- Pink synthesizes conflicting agent suggestions;
- tool-confirmed facts are separated from model suggestions.

## Current state
GPT coordinator <-> Gemini Reviewer handoff is configured in Vapi.
