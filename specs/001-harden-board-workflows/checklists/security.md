# Security Requirements Checklist: Strata Board Workflow Hardening

**Purpose**: Validate security and authorization requirement quality before planning
**Created**: 2026-03-14

## Authorization Coverage
- [x] CHK001 - Are allowed automation roles defined by scope for system, workspace, and board administrators? [Completeness, Spec §FR-002]
- [x] CHK002 - Are server-side rejection requirements defined for unauthorized automation mutations? [Coverage, Spec §FR-003]
- [x] CHK003 - Are allowed archive and unarchive roles defined for board and card actions? [Completeness, Spec §FR-004]
- [x] CHK004 - Are server-side rejection requirements defined for unauthorized archive and unarchive requests? [Coverage, Spec §FR-005]
- [x] CHK005 - Does the spec preserve the existing RBAC model for all affected features instead of redefining permissions? [Consistency, Spec §FR-006]

## Boundary Conditions
- [x] CHK006 - Are cross-workspace and cross-board scope boundaries covered by edge cases or requirements? [Coverage, Spec §Edge Cases]
- [x] CHK007 - Are visibility and action permissions both covered so UI hiding is not the only control? [Gap, Spec §FR-002 to FR-006]
