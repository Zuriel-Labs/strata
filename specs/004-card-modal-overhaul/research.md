# Research: Card Modal Overhaul

## Watch State Scope
**Decision**: Keep `watching` as a boolean for the active signed-in user rather than expanding the card model.
**Rationale**: The current state tree already models a single active user and all current watch-related UI reads from the same boolean.
**Alternatives Considered**: Add watcher IDs to the card payload (rejected - would broaden scope into backend data design).

## Optional Section Visibility
**Decision**: Derive initial visibility from existing card data and store user-triggered section reveals in component state.
**Rationale**: This supports the requested default-hidden sections without persisting presentation-only state.
**Alternatives Considered**: Always render empty sections with placeholders (rejected - conflicts with the requested layout).

## Title Editing Pattern
**Decision**: Use a text-to-input swap for the title, with save on blur and Enter and cancel-on-empty fallback to the previous title.
**Rationale**: This mirrors the target interaction and avoids accidental continuous persistence on every keystroke.
**Alternatives Considered**: Keep a permanently editable input (rejected - mismatched UX).
