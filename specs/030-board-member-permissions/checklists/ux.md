# UX Requirements Checklist: Board Member Card Collaboration

**Purpose**: Test requirement quality for role-aware controls and failure-honest interactions
**Created**: 2026-08-25
**Feature**: [spec.md](../spec.md)

## Role-Aware Interaction

- [x] CHK001 - Are Member, Observer, author, and administrator control-visibility expectations defined? [Coverage, Spec §FR-014]
- [x] CHK002 - Is card drag explicitly permitted while swimlane drag remains excluded for Members? [Clarity, Spec §US1]
- [x] CHK003 - Are existing-label assignment and shared-label management distinguished? [Consistency, Spec §Clarifications]
- [x] CHK004 - Is a complete existing-automation edit journey specified rather than only enabled-state toggling? [Completeness, Spec §US4]

## Feedback and Recovery

- [x] CHK005 - Are invalid comment and automation edit states required to preserve existing data? [Coverage, Spec §US2, US4]
- [x] CHK006 - Is authoritative recovery required for failed optimistic mutations? [Completeness, Spec §FR-015]
- [x] CHK007 - Are persistent-after-refresh outcomes stated for core Member and automation journeys? [Measurability, Spec §SC-001, SC-004]
