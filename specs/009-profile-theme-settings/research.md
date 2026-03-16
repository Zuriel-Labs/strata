# Research: Profile Theme Settings

## Theme preference persistence
**Decision**: Persist the selected theme on the signed-in user's record and include it in the authenticated session payload.
**Rationale**: Theme selection is part of account preferences in the requested UX, so it should survive refreshes and future sessions without relying on device-local state only.
**Alternatives Considered**: Local storage only (rejected - not tied to the user profile and less consistent across sign-ins).

## Self-service profile editing path
**Decision**: Add authenticated self-service update endpoints for the current user's display name, initials, color, and theme preference.
**Rationale**: The existing editable fields already exist in the data model, but only system-admin routes can update them today.
**Alternatives Considered**: Reusing admin-only user patch behavior (rejected - overly broad permissions surface for self-service settings).

## Account menu interaction model
**Decision**: Keep the top-right avatar entry point and expand the existing overlay into a stacked account-settings flow with a root menu and sub-overlays.
**Rationale**: This matches the requested click or touch flow while preserving the current shell layout.
**Alternatives Considered**: A dedicated settings page route (rejected - conflicts with the requested overlay pattern and adds unnecessary route management).

## Accessibility-first theme update
**Decision**: Move hard-coded theme colors toward semantic tokens that support a stronger dark palette and a matching light palette.
**Rationale**: Contrast problems currently come from dark-first token choices embedded at the app root and across shared surfaces.
**Alternatives Considered**: Patch only a few text colors in isolated components (rejected - too brittle and unlikely to cover the full authenticated shell consistently).

## Schema change strategy
**Decision**: Add a startup-safe migration for any new user preference column within `createSchema` so existing SQLite databases are upgraded in place.
**Rationale**: The project constitution requires database structural changes to ship with a startup migration path.
**Alternatives Considered**: Manual database reset or one-off migration scripts outside startup (rejected - not safe for existing live databases).
