# Feature Specification: Login Blue/Purple Theme

**Feature Branch**: `010-login-blue-purple-theme`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "The login screen has a unique UI palette. Let's try something more Blue and Purple tones. Login page is always dark mode."

## User Scenarios & Testing

### User Story 1 - Blue/Purple Dark Login Experience (Priority: P1)

A user visits the login page and sees a cohesive dark-mode design with blue and purple tones across the background gradient, card, inputs, buttons, and accent text — replacing the current teal/amber palette.

**Why this priority**: This is the core request — visual refresh of the login screen's color palette.

**Independent Test**: Can be fully tested by loading the login page and visually confirming that all colors use blue/purple tones with no leftover amber/teal accents.

**Acceptance Scenarios**:

1. **Given** the user navigates to the login page, **When** the page renders, **Then** the background gradient transitions through deep navy-blue and purple hues
2. **Given** the login card is visible, **When** inspecting the card, **Then** it has a dark translucent background with a subtle blue/purple-tinted border
3. **Given** input fields are rendered, **When** inspecting them, **Then** they use a dark blue-tinted background with light text
4. **Given** the submit button is visible, **When** inspecting it, **Then** it uses a blue or purple accent color (not amber)
5. **Given** the "Strata Platform" brand text is shown, **When** inspecting, **Then** it uses a cool-toned accent (blue/lavender) instead of warm tan
6. **Given** auxiliary links are present (e.g., "Forgot password?"), **When** inspecting, **Then** they use a cool-toned text color consistent with the theme

---

### User Story 2 - Bootstrap, Recovery, and Password-Change Screens Match (Priority: P2)

The same blue/purple palette applies to all AuthScreen modes: bootstrap, password-change, and recovery — not just login.

**Why this priority**: Visual consistency across all auth flows ensures a polished experience regardless of which auth screen the user encounters.

**Independent Test**: Can be tested by triggering each auth mode and verifying the same palette is applied.

**Acceptance Scenarios**:

1. **Given** the bootstrap screen is shown, **When** rendering, **Then** the same blue/purple gradient, card, and button styles apply
2. **Given** the password-change screen is shown, **When** rendering, **Then** all elements use the new palette
3. **Given** the recovery screen is shown, **When** rendering, **Then** all elements use the new palette

---

### User Story 3 - Recovery Key Panel Matches Theme (Priority: P3)

When a recovery key is generated and displayed on the auth screen, the key display box and copy button use the blue/purple palette rather than green/amber.

**Why this priority**: Secondary UI elements should not break the visual theme.

**Independent Test**: Trigger recovery key generation on the auth screen and confirm the panel uses the new palette.

**Acceptance Scenarios**:

1. **Given** a new recovery key is displayed, **When** inspecting the panel, **Then** the background/border use blue/purple tints
2. **Given** the "Copy to clipboard" button is shown, **When** inspecting, **Then** it uses a blue/purple button style (not amber)

---

### Edge Cases

- How does the error message (`#ffb4b4` red) look against the new blue/purple background? — Error text should remain a readable red but may shift slightly to harmonize.
- Does the new gradient cause any contrast issues with the form card overlay? — The card opacity/border should ensure sufficient contrast.

## Requirements

### Functional Requirements

- **FR-001**: The login page MUST always render in dark mode (no light-mode variant for auth screens)
- **FR-002**: The background gradient MUST use blue and purple hues (replace the current teal-to-amber gradient)
- **FR-003**: The submit/accent button color MUST shift from amber (`#e2a56a`) to a blue or purple tone
- **FR-004**: The brand accent text ("Strata Platform") MUST shift from warm tan to a cool-toned accent
- **FR-005**: Input field backgrounds MUST use a dark blue-tinted color
- **FR-006**: The card border MUST use a subtle blue/purple-tinted translucent border
- **FR-007**: The recovery key panel (green-tinted background) MUST use blue/purple tints instead
- **FR-008**: All four auth modes (login, bootstrap, password-change, recovery) MUST use the same palette
- **FR-009**: The "Proceed to Login" button on the recovery flow MUST use the new accent color
- **FR-010**: The "Forgot password?" and "Back to sign in" links MUST use cool-toned text

### Non-Goals

- Changing the palette of the main application shell (dashboard, board, etc.) — only the auth screen
- Adding theme-toggle to auth screens — login is always dark mode

## Success Criteria

### Measurable Outcomes

- **SC-001**: All hardcoded color values in `AuthScreen.tsx` are replaced — zero amber/teal values remain
- **SC-002**: The login page renders with a cohesive blue/purple dark palette verified by visual inspection
- **SC-003**: All four auth modes (login, bootstrap, password-change, recovery) share the same visual palette
- **SC-004**: Existing auth functionality (login, bootstrap, recovery, password change) continues to work without regression
