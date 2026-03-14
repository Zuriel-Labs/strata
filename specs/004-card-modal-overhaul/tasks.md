# Tasks: Card Modal Overhaul (004-card-modal-overhaul)

## Phase 1: Setup
- [x] T001 [P] Review the card modal references and align implementation notes in `specs/004-card-modal-overhaul/`

## Phase 2: Foundation
- [x] T002 [US3] Update membership/watch synchronization in `src/store.tsx`
- [x] T003 [US3] Add reducer coverage for member-driven watch enable/disable behavior in `src/store.test.ts`

## Phase 3: User Story 1 - Cleaner Modal Shell (Priority: P1)
- [x] T004 [US1] Rebuild the modal header and remove overflow/sidebar action layout in `src/components/CardModal.tsx`
- [x] T005 [US1] Replace the always-editable title input with inline title editing in `src/components/CardModal.tsx`
- [x] T006 [US1] Move list selection into the top bar and keep close behavior unchanged in `src/components/CardModal.tsx`

## Phase 4: User Story 2 - Reveal Optional Metadata (Priority: P1)
- [x] T007 [US2] Add reference-style section reveal controls in `src/components/CardModal.tsx`
- [x] T008 [US2] Make Members, Labels, Due Date, and Attachments conditional and ordered correctly in `src/components/CardModal.tsx`
- [x] T009 [US2] Remove checklist UI and checklist affordances from `src/components/CardModal.tsx`
- [x] T010 [US2] Preserve description, comment, activity, and attachment flows inside the refreshed layout in `src/components/CardModal.tsx`

## Phase 5: User Story 3 - Membership-Aligned Watch State (Priority: P2)
- [x] T011 [US3] Replace text watch affordances with eye/eye-off icon states in `src/components/CardModal.tsx`
- [x] T012 [US3] Keep watch persistence aligned with member add/remove actions in `src/components/CardModal.tsx`

## Phase 6: Regression Coverage
- [x] T013 [US1] Add modal interaction coverage for top-bar controls, title editing, and section visibility in `src/components/CardModal.test.tsx`
- [x] T014 [US3] Update end-to-end card modal coverage for list move and watch behavior in `tests/e2e/app.spec.ts`

## Phase 7: Polish
- [x] T015 [P] Verify mobile and desktop layout against the supplied references in `src/components/CardModal.tsx`
- [x] T016 [P] Run lint and targeted tests for modal/store changes from `package.json` scripts
