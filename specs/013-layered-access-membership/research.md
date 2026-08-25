# Research: Layered Administration and Board-Rooted Membership

## Existing Strata behavior

**Decision**: Replace the semantic use of `workspace_memberships.role=workspace_admin` and `board_memberships.role=board_admin`; do not add more values to the current dropdowns.

**Rationale**: Current storage, session snapshots, RBAC checks, and Admin forms all conflate collaboration and authority. A dropdown-only patch cannot represent a non-member administrator, multiple simultaneous scopes, safe delegation, or board-rooted workspace membership.

**Alternatives considered**:

- Add `workspace_admin` and `board_admin` to `platform_role`: rejected because one scalar cannot express multiple resources or mixed layers.
- Keep admin values in membership tables: rejected because access would continue to imply membership.
- Encode assignments in JSON on `users`: rejected because foreign keys, uniqueness, bounded queries, cascades, auditing, and atomic updates would be weaker.

## Object-scoped grants and multiple roles

**Decision**: Store static administrative roles as explicit user-to-resource grants and calculate effective permissions from relationships.

**Rationale**: [OpenFGA's roles and permissions guidance](https://openfga.dev/docs/modeling/roles-and-permissions) states that a user may hold more than one role and models roles as direct relationships to objects. Its design guidance recommends explicit domain relationships rather than one generic authorization object. Strata has a small fixed role vocabulary, so dedicated grant tables are clearer than a generic policy engine.

**Alternatives considered**:

- Introduce OpenFGA as a service: rejected as unnecessary operational complexity for four fixed relationships.
- Generic `role_assignments(resource_type, role)` table: rejected because type-specific tables provide stronger foreign keys and clearer queries at current scope.

## Hierarchical effective authority

**Decision**: Workspace Administrator grants confer effective Board Administrator authority to descendant boards; explicit board grants remain independent.

**Rationale**: [Google Cloud IAM](https://docs.cloud.google.com/iam/docs/resource-hierarchy-access-control) models parent-policy inheritance and effective access as the union of parent and resource grants, while recommending grants at the smallest needed scope. This directly fits workspace → board. An explicit board grant remains useful outside a user's workspace scope.

**Alternatives considered**:

- Materialize one Board Administrator row per board for Workspace Administrators: rejected because new boards would require fan-out writes and provenance would be unclear.
- Require both Workspace and Board grants: rejected because it defeats parent-scope administration.

## Separate administration from collaboration membership

**Decision**: Only Board memberships represent collaboration. Workspace membership is derived from the set of parent workspaces for those boards.

**Rationale**: GitHub distinguishes organization, team, and repository roles and supports [resource collaborators who are not organization members](https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization). Trello separately documents [Workspace Admin and Board Admin capabilities](https://support.atlassian.com/trello/docs/workspace-admin-capabilities/) and board collaboration through person search plus a Board Member/Observer assignment. Strata intentionally differs from Trello by allowing administrative grants without membership, but adopts the strong separation between resource administration and collaboration.

**Alternatives considered**:

- Preserve direct workspace Member assignments: rejected by the product rule that board membership is the root.
- Automatically make every administrator a Member: rejected because administrative access is explicitly not membership.

## Delegation and anti-escalation

**Decision**: System Administrators assign administrative grants. Scoped administrators manage Board memberships only within effective scope.

**Rationale**: [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) separates reusable roles from scoped bindings and prevents a principal from binding authority they do not already have. Strata uses the stricter initial rule that only global administrators bind administrative authority; scoped administrators can manage collaboration without escalating privileges.

**Alternatives considered**:

- Let Workspace Administrators create other Workspace Administrators: deferred because it adds an escalation/delegation policy not requested explicitly.
- Let Board Administrators create accounts: rejected because the user requires selection from existing system accounts.

## Scalable selection and directory behavior

**Decision**: Use server-filtered deterministic pagination, debounced search, workspace-qualified board results, persistent selected chips, and bounded pages.

**Rationale**: The current form renders every resource and one unbounded user select. Atlassian's [add-a-person board workflow](https://support.atlassian.com/trello/docs/adding-people-to-a-board/) starts with person search and then assigns board-level access. GitHub role assignments similarly separate the role assignment screen from the resource role definition. Bounded search avoids sending and mounting the full directory.

**Defaults**:

- page size default 25; accepted range 1–100;
- deterministic order by case-insensitive display name/title, then stable ID;
- search is trimmed and case-insensitive;
- selected off-page resources remain as chips and are submitted by ID;
- board labels include `Workspace / Board` and a workspace filter.

## Migration

**Decision**: Add grant tables, migrate legacy administrator roles idempotently, normalize legacy Board Administrator membership to Member, and stop reading direct workspace memberships for authority or collaboration.

**Rationale**: This preserves effective access and collaboration while allowing new non-member administrators. Legacy Board Administrators previously collaborated with the board, so migration retains that collaboration at Member level plus a separate grant. Legacy Workspace Administrators receive grants; legacy direct workspace rows remain physically preserved for rollback evidence but become semantically inactive.

**Compatibility/rollback**:

- The old tables are not dropped in this release.
- Grant migrations use uniqueness plus insert-ignore semantics.
- Legacy `board_admin` rows are normalized to `member` only after an equivalent grant is inserted in the same transaction.
- Rollback to old code after normalization would lose the old admin marker, so production rollback requires restoring the pre-deployment database snapshot or a compatibility backfill. This is documented and will be verified before production approval.

## Concurrency and session freshness

**Decision**: Treat the account `updatedAt` value as an optimistic concurrency token for full account updates; invalidate target sessions after any authorization or membership mutation.

**Rationale**: Full replacement of multiple assignment sets can otherwise erase another administrator's concurrent change. Session invalidation is already established for platform-role changes and must expand to scoped grants and membership.
