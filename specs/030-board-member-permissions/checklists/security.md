# Security Requirements Checklist: Board Member Card Collaboration

**Purpose**: Test the completeness and precision of authorization and trust-boundary requirements
**Created**: 2026-08-25
**Feature**: [spec.md](../spec.md)

## Authorization Boundaries

- [x] CHK001 - Are exact Member and Observer role semantics defined independently from administration? [Clarity, Spec §Clarifications]
- [x] CHK002 - Are in-scope, out-of-scope, inherited, and global administrator behaviors specified? [Coverage, Spec §FR-001, FR-009]
- [x] CHK003 - Are capabilities that Members must not inherit enumerated? [Completeness, Spec §FR-005]
- [x] CHK004 - Is server-side enforcement required independently of UI visibility? [Completeness, Spec §FR-014]

## Comment Integrity

- [x] CHK005 - Is authenticated author derivation specified so client author spoofing is impossible? [Clarity, Spec §FR-007]
- [x] CHK006 - Are own-comment edit, cross-author denial, Member deletion denial, and administrator deletion defined? [Coverage, Spec §FR-008, FR-009]
- [x] CHK007 - Is generic-update bypass prevention explicitly required for comments and activity? [Gap, Spec §FR-010]
- [x] CHK008 - Are missing, repeated, empty, and failed comment mutations covered? [Coverage, Spec §Edge Cases]

## Audit and Data Integrity

- [x] CHK009 - Are attributable Board-scoped audit requirements stated for new mutation paths? [Completeness, Spec §FR-013]
- [x] CHK010 - Are eligible card-member constraints explicit for active Member-role accounts on the same Board? [Clarity, Spec §FR-004]
- [x] CHK011 - Is automation Board scope immutable during edits? [Consistency, Spec §FR-011]
