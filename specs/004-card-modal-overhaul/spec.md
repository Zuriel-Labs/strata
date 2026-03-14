# Feature Specification: Card Modal Overhaul

**Feature Number**: 004
**Short Name**: card-modal-overhaul
**Branch**: `004-card-modal-overhaul`
**Created**: 2026-03-14

---

## Overview

Refresh the card modal so it matches the provided reference images more closely, simplifies top-level actions, and makes optional card metadata feel intentionally added instead of always-on. The modal should foreground the list selector, watch control, inline title editing, and a predictable section order while removing the overflow menu and all checklist affordances.

---

## User Scenarios & Testing

### US1: Edit a card from a cleaner modal shell (P1)
**As a** board user,
**I want** the card modal header and title area to match the new design,
**so that** I can move cards, watch them, edit the title inline, and close the modal without extra chrome.

**Acceptance Scenarios:**
- **Given** a card modal is open, **when** I look at the top bar, **then** I see the current list as a dropdown on the left and the watch toggle plus close button on the right.
- **Given** the list dropdown is open, **when** I choose a different list, **then** the card moves immediately to that list and the modal stays open.
- **Given** the card title is displayed, **when** I click it, edit it, and press Enter or click away, **then** the new title is saved and edit mode exits.
- **Given** the overflow menu existed previously, **when** I open the refreshed modal, **then** no triple-dot button or overflow actions are present.

### US2: Reveal only the metadata sections I need (P1)
**As a** board user,
**I want** the card body to show description and comments by default while other sections appear only when relevant,
**so that** the modal feels focused and closely matches the reference layouts.

**Acceptance Scenarios:**
- **Given** a card without members, labels, due date, or attachments, **when** I open the modal, **then** Description and Comments are visible by default and the optional sections are hidden.
- **Given** I add or reveal optional card metadata, **when** the modal renders the body, **then** sections appear in this order: Members, Labels, Due Date, Description, Attachments, Comments.
- **Given** I need to add optional metadata, **when** I use the modal controls, **then** I can reveal the corresponding section without using an overflow menu.
- **Given** the previous modal supported checklist actions, **when** I use the refreshed modal, **then** no checklist section or checklist add action is shown.

### US3: Keep watch state aligned with card membership (P2)
**As a** signed-in user,
**I want** watch state to stay in sync with whether I am assigned to the card,
**so that** watching behaves predictably when my membership changes.

**Acceptance Scenarios:**
- **Given** I am added to a card as a member, **when** the member list updates, **then** watch is enabled for me automatically.
- **Given** I am removed from a card as a member, **when** the member list updates, **then** watch is disabled for me automatically.
- **Given** a card is newly created, **when** it first appears, **then** watch remains disabled until I enable it or I am later auto-watched by membership rules.
- **Given** I view the watch control, **when** watch is enabled, **then** I see a standard eye icon, and **when** it is disabled, **then** I see a slashed eye icon.

---

### Edge Cases

- If the title edit is confirmed with an empty or whitespace-only value, the modal keeps the previous non-empty title.
- If an optional section is manually revealed before it has data, it stays available for input during that modal session.
- If the current user removes another member from the card, watch state for the current user does not change unless the current user was the member removed.
- If the user selects the current list from the dropdown, the modal does not create duplicate movement side effects.

## Functional Requirements

- **FR-001**: The modal MUST remove the triple-dot overflow button and all associated overflow actions from the header area.
- **FR-002**: The modal header MUST show the card's current list as a dropdown on the left side.
- **FR-003**: Selecting a different list from the header dropdown MUST move the card immediately and persist the change.
- **FR-004**: The modal header MUST show a watch toggle and the existing close control on the right side, in that order.
- **FR-005**: The card title MUST render as read-only text by default and enter inline edit mode only after direct interaction with the title.
- **FR-006**: Inline title edits MUST persist when confirmed with Enter or by blurring the field.
- **FR-007**: The modal MUST keep Description and Comments visible by default.
- **FR-008**: Members, Labels, Due Date, and Attachments MUST remain hidden until they either already contain data or are explicitly revealed through modal controls.
- **FR-009**: When rendered, body sections MUST appear in this order: Members, Labels, Due Date, Description, Attachments, Comments.
- **FR-010**: The modal MUST provide direct controls that let the user reveal optional sections without using an overflow menu.
- **FR-011**: The modal MUST NOT render checklist sections, checklist actions, or checklist references anywhere in the refreshed card experience.
- **FR-012**: The watch toggle MUST show an eye icon for the enabled state and a slashed eye icon for the disabled state.
- **FR-013**: When the current active user is newly added to the card's members, watch MUST become enabled automatically for that user.
- **FR-014**: When the current active user is removed from the card's members, watch MUST become disabled automatically for that user.
- **FR-015**: Creating a new card MUST NOT auto-enable watch.
- **FR-016**: Existing description, attachment, comment, and activity functionality MUST continue to work inside the refreshed layout.

### Key Entities

- **Card**: A board item with list placement, title, description, members, labels, due date, attachments, comments, activity, and a watch state for the active session user.
- **Card Modal Session**: The temporary UI state that tracks whether the title is being edited and which optional sections have been revealed while the modal is open.

## Success Criteria

- **SC-001**: Opening a card modal shows the list dropdown, watch control, and close button in the top bar with no overflow menu present.
- **SC-002**: Cards without optional metadata show only Description and Comments until the user reveals more sections.
- **SC-003**: Cards with optional metadata render every visible section in the specified order with no checklist affordances visible.
- **SC-004**: Users can change a title in one interaction and see the updated title persist after Enter or blur.
- **SC-005**: Adding the active user as a member auto-enables watch, and removing that same user auto-disables watch.
