# Research: Admin User Deletion Workflow

## Safety guardrails for destructive account deletion
**Decision**: Require a two-step confirmation flow in the UI and reject deletion of the current session user or the last remaining active system admin on the server.
**Rationale**: The requested delete action is irreversible, so both accidental clicks and platform lockout scenarios need explicit protection.
**Alternatives Considered**: A single confirmation dialog only (rejected - too easy to confirm accidentally for a permanent action).

## Cleanup strategy for deleted-user references
**Decision**: Treat sessions, recovery keys, password resets, workspace memberships, board memberships, notifications, card member arrays, and automation assignment targets as live references that must be removed or remediated during deletion.
**Rationale**: These references assume the account still exists and would otherwise produce invalid access or invalid future assignments.
**Alternatives Considered**: Rely only on foreign-key cascades (rejected - card member arrays and automation configs are JSON fields and would still point at a deleted user).

## Historical rendering after account obliteration
**Decision**: Keep comments, activity, and other created records as-is and render unresolved authors as `Deleted user` with a neutral avatar fallback.
**Rationale**: The request requires created work to remain while the account is fully removed; UI fallback rendering preserves readability without adding schema migrations.
**Alternatives Considered**: Copy author profile snapshots into every artifact during deletion (rejected - unnecessary data migration for the requested behavior).
