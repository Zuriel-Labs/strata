# Research: Strata Board Workflow Hardening

## Branding Gap

**Decision**: Treat `index.html` as the primary remaining live branding source and remove any residual `FlowBoard` references discovered during implementation.

**Rationale**: Repo exploration found runtime copy already aligned with `Strata`, while the browser tab title still ships from the HTML shell.

**Alternatives Considered**:
- Add a runtime title override everywhere - rejected because the static title is the current source of truth and should be fixed directly.

## Label Persistence Model

**Decision**: Keep board labels in `boards.labels_json` and add repository plus route helpers to replace the active board label set after validation.

**Rationale**: The project already persists labels on the board record and hydrates them through the session payload. Extending that path minimizes schema churn and keeps board-scoped isolation straightforward.

**Alternatives Considered**:
- Normalize labels into a dedicated table - rejected for this feature because board-local CRUD, assignment validation, and session hydration can be delivered faster with the existing JSON model.

## Automation Conditions Model

**Decision**: Introduce explicit automation conditions for list and label filtering alongside trigger-specific configuration.

**Rationale**: The backlog refers to a `Lists` dropdown and a new `Labels` dropdown as conditions, and scheduled rules need a way to target matching cards even when no user event provides a single source card.

**Alternatives Considered**:
- Keep conditions embedded only inside `triggerConfig` - rejected because that makes scheduled and event-driven rules harder to validate consistently.

## Scheduled Automation Execution

**Decision**: Add a lightweight server-side automation runner inside the Express process that polls for enabled schedule-based rules and applies actions to matching non-archived cards.

**Rationale**: Current automations execute only inside the client reducer, which cannot satisfy date-based or recurring execution when no user action occurs. An in-process runner fits the existing single-server architecture and avoids external infrastructure.

**Alternatives Considered**:
- Keep scheduled rules client-only - rejected because scheduled execution would stop when no browser session is open.
- Add a separate queue or worker service - rejected as unnecessary complexity for the current deployment model.

## RBAC Hardening Approach

**Decision**: Add semantic board policy helpers for automation management, archive or restore actions, board-label management, and card edit affordances while continuing to build them on top of the current role hierarchy.

**Rationale**: Server routes already centralize around `canManageBoard`; naming the permissions by feature makes intent clearer and gives the frontend an exact visibility model to mirror.

**Alternatives Considered**:
- Keep direct `canManageBoard` checks inline everywhere - rejected because the current feature spans multiple UI surfaces and risks more permission drift.

## Card UX Changes

**Decision**: Implement the streamlined add-card flow in the existing list composer and replace label toggles with a searchable picker in the existing card modal.

**Rationale**: The current surfaces already exist and are where users expect these actions. Updating them avoids introducing duplicate card creation or label assignment patterns.

**Alternatives Considered**:
- Add new modal flows for card creation and label assignment - rejected because the requested change is specifically about simplification.
