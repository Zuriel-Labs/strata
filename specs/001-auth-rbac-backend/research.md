# Research: Server-Backed Auth and RBAC

## Backend framework

**Decision**: Use Express for the Node API.

**Rationale**: The app already has a Vite frontend and needs a small backend added incrementally, not a full framework migration. Express gives straightforward middleware, cookie handling, and route composition for auth and RBAC without forcing a larger restructure.

**Alternatives Considered**:
- Fastify: faster and typed well, but adds a slightly different plugin model without meaningful MVP benefit here.
- Next.js or Remix migration: too disruptive for a feature whose primary goal is backend persistence and authorization.

## SQLite access layer

**Decision**: Use `better-sqlite3` with a small repository layer and bootstrap migrations on startup.

**Rationale**: The feature needs deterministic local persistence, simple seed/bootstrap behavior, and fast synchronous queries for a small single-process Node service. `better-sqlite3` is well-suited for local apps and test fixtures.

**Alternatives Considered**:
- `sqlite3`: callback-heavy and less ergonomic.
- ORM-first stack: unnecessary complexity for the first backend slice.

## Authentication model

**Decision**: Use hashed passwords with bcrypt, a server-side session table, and an HTTP-only session cookie.

**Rationale**: Session auth matches the product's browser app shape, supports forced logout or invalidation after admin changes, and avoids JWT revocation complexity for the MVP.

**Alternatives Considered**:
- JWT access tokens: more client complexity and weaker revocation ergonomics for admin-managed role changes.
- OAuth-only auth: not aligned with the current no-email, no-identity-provider MVP.

## Password reset flow

**Decision**: Implement admin-triggered reset with a generated temporary password and a forced-password-change state.

**Rationale**: This matches the product constraints because email delivery does not exist yet while still allowing secure account recovery and operator control.

**Alternatives Considered**:
- Email reset links: blocked by missing infrastructure.
- Admin directly setting permanent passwords: weaker operator hygiene and no first-login rotation.

## RBAC model

**Decision**: Model permissions with one platform role on the user plus scoped workspace and board memberships.

**Rationale**: The requested roles naturally break across platform-level and scoped privileges. This structure keeps enforcement explicit and maps cleanly to API authorization helpers.

**Alternatives Considered**:
- Single flat role per user: too coarse for workspace and board delegation.
- Fully dynamic permission matrix: more flexible, but unnecessary complexity for MVP.

## Frontend integration strategy

**Decision**: Keep the current React UI, replace local storage hydration with authenticated API bootstrap requests, and add protected auth/admin screens inside the existing app shell.

**Rationale**: This preserves the current product shape and lets the new backend land without a redesign or full routing rewrite.

**Alternatives Considered**:
- Full React Router app split: viable later, but more structural churn than needed for the MVP foundation.
- Leave existing local state in place: would not satisfy real auth or API-enforced RBAC.
