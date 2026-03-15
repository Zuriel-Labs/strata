# Tasks: Card Attachment Actions (007-card-attachment-actions)

## Phase 1: Setup
- [x] T001 [P] Review current attachment upload and rendering behavior in `src/components/CardModal.tsx`, `src/types.ts`, and `src/data.ts`

## Phase 2: Foundation
- [x] T002 Add persisted upload payload support to the attachment model in `src/types.ts`
- [x] T003 Keep seeded file attachments compatible with the updated attachment shape in `src/data.ts`

## Phase 3: User Story 1 - Download an uploaded attachment (Priority: P1)
- [x] T004 [US1] Persist uploaded file content through the existing card update flow in `src/components/CardModal.tsx`
- [x] T005 [US1] Add download controls for uploaded attachments in `src/components/CardModal.tsx`

## Phase 4: User Story 2 - View browser-compatible uploads (Priority: P1)
- [x] T006 [US2] Add MIME-based browser-view eligibility rules in `src/components/CardModal.tsx`
- [x] T007 [US2] Add view-in-new-tab controls for compatible uploaded attachments in `src/components/CardModal.tsx`

## Phase 5: User Story 3 - Preserve attachment clarity and existing flows (Priority: P2)
- [x] T008 [US3] Keep attachment row styling and action order aligned with the existing modal UI in `src/components/CardModal.tsx`
- [x] T009 [US3] Add component regression coverage for uploaded attachment actions in `src/components/CardModal.test.tsx`
- [x] T010 [US3] Extend end-to-end coverage for upload and attachment actions in `tests/e2e/app.spec.ts`

## Phase 6: Polish
- [x] T011 [P] Verify desktop/mobile attachment action layout in `src/components/CardModal.tsx`
- [x] T012 Run targeted lint and test commands for attachment changes from `package.json` scripts
