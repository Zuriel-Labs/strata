# Consistency Analysis: Kanban Productivity Suite

**Date**: 2026-08-24
**Artifacts reviewed**: constitution, specification, five quality checklists, plan, research, data model, OpenAPI contract, quickstart, tasks, and both rounds of canary feedback

## Coverage summary

| Area | Requirements | Acceptance scenarios | Task coverage | Status |
|---|---:|---:|---|---|
| US1 / Issue #15 card ordering | 13 | 9 | T011–T020 and T083–T084 plus cross-cutting tasks | Covered |
| US2 / Issue #19 rich descriptions | 15 | 9 | 13 story-tagged tasks plus cross-cutting tasks | Covered |
| US3 / Issue #18 label management | 14 | 9 | T028–T035 and T085 plus cross-cutting tasks | Covered |
| US4 / Issue #17 duplication | 11 | 7 | 7 story-tagged tasks plus cross-cutting tasks | Covered |
| US5 / Issue #16 sorting | 9 | 7 | 7 story-tagged tasks plus cross-cutting tasks | Covered |
| US6 / Issue #22 checklist regression | 6 | 6 | T073–T074 plus cross-cutting tasks | Covered |
| US7 / Issue #21 archive integrity | 6 | 7 | T075–T077 and T089 plus cross-cutting tasks | Covered |
| US8 / Issue #15 swimlane ordering | 4 | 6 | T086–T088 plus cross-cutting tasks | Covered |
| Delivery/security/regression | 5 | cross-cutting | T050–T064 and T078–T081 | Covered |

All 83 functional requirements and 60 Given/When/Then acceptance scenarios have implementation and validation work. The 93 task identifiers are contiguous, all quality checklist items are complete, no unresolved placeholder or clarification marker remains, and no API-contract change is required for the second remediation because it reuses the existing exact-position list move and card update endpoints.

## Findings and remediation

| ID | Severity | Finding | Remediation | Result |
|---|---|---|---|---|
| C-001 | Medium | Duplicate due-date completion semantics were phrased as history reset in the data model but explicitly copied in FR-040. | Clarified that the current completion boolean is copied while only prior activity/history is excluded; aligned quickstart acceptance. | Resolved |
| C-002 | Medium | Research allowed heading level 1 while FR-014 limits the product contract to levels 2 and 3. | Restricted research and OpenAPI attribute bounds to heading levels 2–3. | Resolved |
| C-003 | Medium | Legacy `description` and structured `descriptionDocument` could be submitted together without defined precedence. | Defined them as mutually exclusive, made structured input canonical, added OpenAPI exclusion and a RED validation task. | Resolved |
| C-004 | High | First candidate required a separate/keyboard drag handle that failed the user's whole-card interaction and did not function reliably. | Replaced it with pointer-only full-card activation and explicit release-to-open/drag-suppression criteria, including real touch input coverage. | Resolved and validated |
| C-005 | Critical | Label drafts were reset by passive prop refresh, making new labels disappear before Save. | Defined draft ownership until Save/Cancel and added hold/refresh regression coverage to both managers. | Resolved in artifacts |
| C-006 | High | Checklist acceptance referred to a feature removed by the modal redesign. | Confirmed the historical regression and added Issue #22, US6, requirements, and implementation/validation tasks. | Resolved in artifacts |
| C-007 | Critical | Archived-list child cards rendered as phantom rows and archived lists had no delete path. | Added Issue #21, parent-aware projection, archived-only deletion/RBAC/audit/cascade requirements, and both-surface coverage. | Resolved in artifacts |
| C-008 | Medium | Duplicate watching semantics reset all copies even when the actor was both assigned and watching. | Defined actor-conditional watching with four-state tests. | Resolved in artifacts |
| C-009 | Medium | Rich edit/view styling and link interaction diverged; unnecessary Undo/Redo controls were inert. | Added shared styling, direct-link, and removal/native-undo acceptance criteria. | Resolved in artifacts |
| C-010 | Critical | Moving a card into a destination with two or more cards could blank the board with a browser `removeChild` exception. | Reproduced the destination-third-card failure, traced it to optimistic sortable DOM reparenting competing with React ownership, disabled that plugin, and made React state own cross-group previews. | Resolved and browser-validated |
| C-011 | High | An assigned label row displayed `Added` but was disabled, so it could not act as the expected reversible toggle. | Made every picker row a permission-aware optimistic toggle with authoritative response, pending lockout, error feedback, and rollback coverage. | Resolved and browser-validated |
| C-012 | High | Native lane dragging lacked a lane-shaped overlay, insertion gap, animated horizontal preview, touch parity, and failure-honest persistence. | Replaced it with board-scoped sortable lanes using a title activator, React-owned preview, faded source placeholder, lane overlay, exact persisted position, touch, reduced motion, and rollback tests. | Resolved and browser-validated |
| C-013 | High | The Management shell's short content-driven height clipped archived-list deletion confirmation text and actions. | Added a responsive viewport-bounded height and archive confirmation minimum content height with mobile/tablet/desktop visibility checks. | Resolved in focused tests |

## Gate result

- Critical findings: 0
- High findings: 0
- Unresolved medium findings: 0
- Constitution violations: 0
- Authorization/data-integrity gaps: 0 known
- Production-safety conflicts: 0

**Decision**: PASS. Implementation may begin after recording the fresh baselines required by T001.
