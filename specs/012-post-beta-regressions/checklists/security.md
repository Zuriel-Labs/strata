# Security Requirements Checklist: Post-Beta Consistency and Drag Reliability

**Purpose**: Preserve RBAC, isolation, audit, and safe failure semantics
**Created**: 2026-08-25
**Feature**: [spec.md](../spec.md)

- [x] CHK001 Cross-workspace visual-state isolation has a strict selection invariant.
- [x] CHK002 Automation selectors cannot expand existing server authorization.
- [x] CHK003 Read-only reorder denial is explicit.
- [x] CHK004 Existing mutation validation, RBAC, audit, and error behavior are preserved.
- [x] CHK005 No database deletion, migration, or production mutation is required by the feature.
