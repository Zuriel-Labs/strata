# Security Checklist: Core Platform Overhaul

**Purpose**: Validate security requirement quality
**Created**: 2026-03-13

## Authentication
- [x] CHK-S01 - Are password minimum requirements specified? [Completeness, Spec FR-002/FR-003]
- [x] CHK-S02 - Is the confirm-password requirement defined for all password-setting flows? [Coverage, Spec FR-005]
- [x] CHK-S03 - Are recovery key generation and consumption flows defined with single-use semantics? [Completeness, Spec FR-006/FR-007/FR-008]
- [x] CHK-S04 - Is the bootstrap wizard scoped to zero-user state only? [Clarity, Spec FR-003]

## Authorization
- [x] CHK-S05 - Is the complete permission matrix specified for every role and action? [Completeness, Spec US4]
- [x] CHK-S06 - Is the Guest role removal explicitly required with migration path? [Completeness, Spec FR-011]
- [x] CHK-S07 - Are workspace-scoped permissions bound to assigned workspace only? [Clarity, Spec FR-013]
- [x] CHK-S08 - Are board-scoped permissions bound to assigned board only? [Clarity, Spec FR-014]

## Data Protection
- [x] CHK-S09 - Are recovery keys stored as hashed values, not plaintext? [Completeness, Spec FR-006]
- [x] CHK-S10 - Is the plaintext recovery key returned only once at generation time? [Clarity, Spec FR-007]
