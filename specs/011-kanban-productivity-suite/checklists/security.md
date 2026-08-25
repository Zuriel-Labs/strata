# Security Requirements Quality Checklist: Kanban Productivity Suite

**Purpose**: Test whether authorization, validation, rendering safety, and audit requirements are complete.
**Created**: 2026-08-24
**Feature**: [spec.md](../spec.md)

- [x] SEC001 - Is UI permission behavior paired with mandatory server-side authorization for every mutation? [Completeness, FR-058]
- [x] SEC002 - Are card ordering, label assignment, label management, duplication, and archive permissions treated as independently enforceable capabilities? [Clarity]
- [x] SEC003 - Are unsafe description nodes, marks, attributes, executable markup, event handlers, and URL schemes explicitly rejected or rendered inactive? [Injection Safety, FR-021, FR-022]
- [x] SEC004 - Are malformed, oversized, deeply nested/unsupported, duplicate-identity, and cross-board inputs covered? [Validation]
- [x] SEC005 - Are safe error response and no-sensitive-data audit requirements explicit? [Data Exposure]
- [x] SEC006 - Does the specification require allowed and denied role validation through both UI and direct mutation paths? [Coverage, SC-006]
- [x] SEC007 - Is production explicitly protected behind approval of an exact immutable canary candidate? [Operational Security, FR-062]
