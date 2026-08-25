---
description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and `contracts/`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable because it touches independent files and has no unfinished dependency.
- **[Story]**: Maps the task to an independently testable user story.
- Every task names concrete repository paths.

## Phase 1: Setup

- [ ] T001 Establish shared feature infrastructure in [paths]

## Phase 2: Foundational

- [ ] T002 Add blocking data, validation, authorization, and error-handling foundations in [paths]

## Phase 3+: User Stories

- [ ] T003 [US1] Write a focused failing test for one observable behavior in [test path]
- [ ] T004 [US1] Implement the smallest change that satisfies the test in [source path]
- [ ] T005 [US1] Refactor with the focused and regression tests green

## Final Phase: Polish and Validation

- [ ] TXXX Complete cross-cutting accessibility, security, documentation, and validation work in [paths]

## Dependencies

- Setup precedes foundational work.
- Foundational work blocks every user story.
- Each user story follows Red → Green → Refactor and remains independently testable.
- Cross-cutting validation follows all requested user stories.
