# UX Requirements Quality Checklist: Kanban Productivity Suite

**Purpose**: Test whether interaction requirements are sufficiently complete and measurable.
**Created**: 2026-08-24
**Feature**: [spec.md](../spec.md)

- [x] UX001 - Are whole-card press/release, hold/movement activation, exact insertion, drop, cancellation, and accidental-open suppression defined for pointer and touch? [Completeness, US1]
- [x] UX002 - Is animated displacement quantified by a visible card-sized destination gap and reduced-motion handling? [Clarity, FR-003, FR-059]
- [x] UX003 - Are loading, success, failure, empty/no-op, and authoritative rollback states specified for all five user stories? [Coverage]
- [x] UX004 - Are keyboard and assistive-technology behaviors required for menus, label management, rich-text controls, checklist controls, archive dialogs, and non-drag card access without claiming keyboard drag? [Accessibility]
- [x] UX005 - Are view/edit fidelity, Save, Cancel, draft recovery, empty content, and read-only rich-text states unambiguous? [Consistency, US2]
- [x] UX006 - Are destructive label deletion and Archive list visually and behaviorally distinguished from non-destructive actions? [Clarity, US3, US5]
- [x] UX007 - Are mobile, tablet, desktop, light/dark theme, focus, and reduced-motion requirements included without claiming unexecuted conformance? [Coverage, FR-059]
- [x] UX008 - Is every success criterion observable without knowing the implementation? [Measurability]
- [x] UX009 - Are edit/view rich-text styling parity, directly clickable read-mode links, and native-platform undo/redo boundaries explicit? [Consistency, US2]
- [x] UX010 - Are checklist and archive controls specified for touch without hover-only discovery? [Responsive, US6, US7]
- [x] UX011 - Is the destination-third-card failure expressed as a no-blank/no-uncaught-error requirement with exact cross-lane ordering and persistence? [Reliability, US1, FR-076]
- [x] UX012 - Are active `Added` label rows explicitly reversible with pending, authoritative response, permission, and rollback states? [Consistency, US3, FR-077]
- [x] UX013 - Are horizontal lane activation, overlay, source placeholder, destination gap, persistence, rollback, touch, permissions, and reduced motion all observable and testable? [Completeness, US8, FR-078–FR-081]
- [x] UX014 - Is Management dialog height bounded responsively while archive warning/actions remain visible or internally reachable at mobile, tablet, and desktop viewports? [Responsive, US7, FR-082–FR-083]
