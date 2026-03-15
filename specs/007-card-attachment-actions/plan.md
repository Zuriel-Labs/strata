# Implementation Plan: Card Attachment Actions

**Branch**: `007-card-attachment-actions` | **Date**: 2026-03-14 | **Spec**: `specs/007-card-attachment-actions/spec.md`

## Summary

Extend card attachment handling so uploaded files persist a retrievable payload, then add download and conditional view controls inside `CardModal` while keeping existing link attachment behavior intact.

## Technical Context

**Language/Version**: TypeScript 5.9 on React 19 and Node.js 20+
**Primary Dependencies**: React, Vite, Express, better-sqlite3, Vitest, Playwright, lucide-react
**Storage**: SQLite-backed card records persisted through the existing card update API
**Testing**: Vitest component tests and targeted Playwright regression for attachment actions
**Target Platform**: Browser-based web application on desktop and mobile viewports
**Project Type**: web
**Performance Goals**: Attachment actions render immediately in the modal and uploaded files remain usable after card persistence and reload
**Constraints**: Preserve the existing card PATCH flow, avoid adding a dedicated file storage service, keep link attachments unchanged, and open viewable files in a separate tab
**Scale/Scope**: Focused card modal and attachment model enhancement affecting upload persistence, rendering, and regression coverage

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec 007 exists before implementation begins |
| Test-Driven Quality | PASS | Component and E2E coverage planned for primary attachment actions |
| Constitution Alignment | PASS | Planned work maps directly to scoped attachment behavior |
| Iterative Refinement | PASS | Work is separated into payload persistence, UI actions, and validation |
| Documentation as Code | PASS | Spec, plan, tasks, contracts, and data notes are created together |

## Phase 0: Research

### Decision 1: Persist uploaded files as attachment URLs backed by data URLs
**Decision**: Store uploaded file content on the attachment record as a browser-retrievable `url` so the current card PATCH flow can persist uploaded files without adding backend file storage.
**Rationale**: The current implementation stores only metadata, which cannot power download or view actions after reload. Reusing the existing attachment shape minimizes API churn while making uploads actionable.
**Alternatives Considered**: Object URLs only (rejected - break after refresh), dedicated server-side file storage (rejected - too large for this scoped fix).

### Decision 2: View eligibility is derived from a conservative MIME allowlist
**Decision**: Show the view action only for uploaded files with MIME types browsers commonly render inline, such as images, PDFs, text, audio, and video.
**Rationale**: This meets the request without showing misleading controls for binary formats like design archives or office documents that may not open inline everywhere.
**Alternatives Considered**: Show view for every file (rejected - inconsistent browser behavior), maintain an extension-only allowlist (rejected - less reliable than MIME metadata when available).

## Phase 1: Design & Contracts

### Data Model
See `specs/007-card-attachment-actions/data-model.md`.

### API Contracts
See `specs/007-card-attachment-actions/contracts/card-attachments.md`.

### Quickstart
See `specs/007-card-attachment-actions/quickstart.md`.

## Project Structure

No repository restructuring is required. The work stays inside the existing card modal, shared attachment types, and frontend regression tests.

### Modified Files

```text
src/
├── components/
│   ├── CardModal.tsx
│   └── CardModal.test.tsx
├── data.ts
└── types.ts

tests/
└── e2e/
    └── app.spec.ts
```

**Structure Decision**: Keep the change in the existing single-frontend structure and continue persisting attachments through the current card update flow.

## Complexity Tracking

No constitution exceptions required.
