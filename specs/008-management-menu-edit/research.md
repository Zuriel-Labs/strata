# Research: Management Menu Inline Editing

## Rename persistence paths

**Decision**: Add dedicated `PATCH` endpoints for workspaces and boards to update only the editable title fields used by the Management overlay.

**Rationale**: The existing API supports create/delete operations and board star/label changes, but it has no rename route. Dedicated endpoints keep the inline edit interaction explicit, easy to authorize, and easy to test.

**Alternatives Considered**:
- Client-only rename state without persistence: rejected because the title would revert on refresh.
- Reusing unrelated endpoints: rejected because it would blur API semantics and complicate validation.

## Boards tab workspace context

**Decision**: Drive the Boards tab header from the currently selected workspace context and render it as a dropdown only when two or more workspace options are available.

**Rationale**: This matches the requested Automations-style behavior while preserving the current single-workspace display when no choice is needed.

**Alternatives Considered**:
- Keeping the header static and relying on the Workspaces tab for context changes: rejected because workspace rows must now trigger inline edits instead of navigation.
- Always rendering a dropdown: rejected because it adds unnecessary chrome when only one workspace exists.

## Inline submit and cancel behavior

**Decision**: Submit trimmed titles on Enter or blur, discard blank submissions back to the previous saved value, and use Escape as a cancel shortcut.

**Rationale**: Enter and blur are explicitly requested, while whitespace rejection and Escape cancel keep the behavior aligned with the existing create flows and common inline-edit expectations.

**Alternatives Considered**:
- Saving blank titles: rejected because existing workspace and board names must remain meaningful and valid.
- Requiring an explicit Save button: rejected because the request asks for creation-style inline field behavior.
