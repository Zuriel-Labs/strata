# Data Model: Profile Theme Settings

## Entities

### Session User Preferences
- **Purpose**: Stores self-managed settings that should reappear on future authenticated sessions.
- **Fields**:
  - `userId`: current authenticated user ID
  - `themePreference`: `dark` or `light`
- **Persistence Rules**:
  - Default to `dark` for users without an explicit saved value.
  - Must be returned as part of the authenticated session payload.
  - Must update immediately after a successful preference save.

### Self-Service Profile
- **Purpose**: Represents the current user's editable account identity fields shown in the top-right avatar and account overlays.
- **Fields**:
  - `name`: display name shown in the account summary and other user-facing surfaces
  - `initials`: short avatar text, limited to a compact initials form
  - `color`: avatar background color
- **Validation Rules**:
  - `name` cannot be empty.
  - `initials` cannot be empty and must remain short enough to render legibly inside the avatar.
  - `color` must be a valid color token accepted by the self-service form.

### Account Overlay State
- **Purpose**: Tracks the current avatar-menu view in the authenticated shell.
- **Fields**:
  - `open`: whether the account overlay is visible
  - `view`: `menu`, `profile`, `preferences`, or `security`
  - `saving`: whether the current sub-overlay submission is in flight
  - `error`: latest submission error message, if any
  - `success`: latest success feedback, if any
- **State Transitions**:
  - `closed -> menu` when the avatar is activated
  - `menu -> profile|preferences|security` when a menu item is chosen
  - `sub-overlay -> menu` on back
  - `sub-overlay -> closed` on close or successful sign out

### Password Change Request
- **Purpose**: Captures the self-service password change submission.
- **Fields**:
  - `currentPassword`
  - `nextPassword`
  - `confirmPassword`
- **Validation Rules**:
  - All fields are required.
  - `nextPassword` and `confirmPassword` must match.
  - `currentPassword` must match the current authenticated credential.

## Backend Storage Impact

### Users table extension
- **New Field**: `theme_preference`
- **Allowed Values**: `dark`, `light`
- **Migration Rule**: Existing databases must receive the new column during startup if it is missing, and existing users should remain effectively `dark` by default.

## Session Payload Impact

### Session User
- Add `themePreference` so the authenticated shell can render the correct theme immediately after session load.

### App State
- No new board-data entity is required; theme selection is a user preference surfaced through auth/session state rather than the board application state tree.
