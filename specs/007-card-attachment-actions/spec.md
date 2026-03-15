# Feature Specification: Card Attachment Actions

**Feature Branch**: `007-card-attachment-actions`
**Created**: 2026-03-14
**Status**: Draft
**Input**: User description: "Attachements in Cards; the file upload works and the link attachment also works. However, specifically when a file is uploaded, it shows to be attached to the card and I can remove it using the \"remove\" button, but I cannot do anything else with the uploaded file. For uploaded files, there needs to be 2 options to the left of 'remove', a download button that could be an icon that is kind of a downward pointing arrow. Try to use a common icon so it's familiar and it aligns with the theme/palette of the surrounding UI. The other thing that needs to be an option is to view the file. But only if it is compatible with browsers where it can be opened within the browser to view. It would open in another tab as not to disrupt access to Strata."

## Overview

Make uploaded card attachments actionable instead of metadata-only. Board users should be able to download any uploaded file from the card modal, open browser-viewable uploads in a new tab, and keep existing link attachment behavior unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download an uploaded attachment (Priority: P1)

As a board user, I want a familiar download control for uploaded files so that I can retrieve the attached file directly from the card modal.

**Why this priority**: Uploaded files are currently a dead end after attachment, so restoring a basic file action is the most important fix.

**Independent Test**: Upload a file to a card, confirm a download control appears to the left of `Remove`, activate it, and verify the browser treats the attachment as a downloadable file.

**Acceptance Scenarios**:

1. **Given** a card has an uploaded file attachment, **When** I view that attachment row, **Then** I see a download control before the `Remove` action.
2. **Given** I activate the download control for an uploaded file, **When** the browser handles the action, **Then** the file downloads using the attachment's filename.
3. **Given** a card has a link attachment, **When** I view that attachment row, **Then** the existing link behavior remains available and the row does not lose its current open-link affordance.

---

### User Story 2 - View browser-compatible uploads (Priority: P1)

As a board user, I want to open supported uploaded files in a separate tab so that I can inspect them without leaving Strata.

**Why this priority**: Previewing supported files is the second missing attachment action and keeps card review flows uninterrupted.

**Independent Test**: Upload a browser-viewable file such as an image, PDF, or plain text file, confirm a view control appears to the left of `Remove`, activate it, and verify it opens in a new browser tab while Strata stays open.

**Acceptance Scenarios**:

1. **Given** an uploaded attachment has a browser-viewable file type, **When** I view its attachment row, **Then** I see a view control between the download control and `Remove`.
2. **Given** I activate the view control for a browser-viewable upload, **When** the browser opens the file, **Then** it opens in a new tab and the current Strata tab remains on the same card.
3. **Given** an uploaded attachment is not browser-viewable, **When** I view its attachment row, **Then** no view control is shown.

---

### User Story 3 - Preserve attachment clarity and existing flows (Priority: P2)

As a board user, I want the attachment actions to feel consistent with the existing modal styling so that the new controls are obvious without disrupting current workflows.

**Why this priority**: The fix should solve the missing actions without creating confusing or visually mismatched controls.

**Independent Test**: Compare uploaded-file rows, link rows, upload flow, and removal flow in the card modal to verify the new controls use familiar iconography, align with the surrounding theme, and do not break add/remove behavior.

**Acceptance Scenarios**:

1. **Given** I look at an uploaded attachment row, **When** the action buttons render, **Then** the download control uses a common downward-arrow style icon and the actions visually match the surrounding modal palette.
2. **Given** I upload or remove attachments after the change, **When** the card updates, **Then** existing add and remove flows still work.
3. **Given** I reopen a card after saving an uploaded attachment, **When** attachment actions render, **Then** the uploaded file still has the actions it is eligible for.

---

### Edge Cases

- If an uploaded file has no detectable MIME type, the system should still offer download but should hide the view action unless the file type can be safely inferred.
- If the browser blocks pop-ups or a new tab for view, the original Strata tab must remain usable and the download option must still be available.
- If an uploaded file is viewable in some browsers but not others, the UI should only rely on the attachment's stored file metadata and a conservative browser-viewable allowlist.
- If a user uploads multiple files at once, each uploaded attachment row should independently show only the actions it supports.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Uploaded file attachments MUST persist enough file data for later download from the card modal after the card is saved.
- **FR-002**: Every uploaded file attachment MUST render a download action to the left of the `Remove` action when the file has a retrievable payload.
- **FR-003**: Activating the download action for an uploaded file MUST download the file using the attachment's display name.
- **FR-004**: Uploaded file attachments MUST render a view action only when the stored file type is compatible with being opened directly in a browser tab.
- **FR-005**: Activating the view action for a compatible uploaded file MUST open the file in a separate browser tab without navigating the current Strata tab away from the card.
- **FR-006**: Uploaded files that are not browser-viewable MUST omit the view action while still allowing download.
- **FR-007**: Link attachments MUST preserve their current open-link behavior and MUST NOT be mislabeled as uploaded-file view or download actions.
- **FR-008**: The attachment row actions MUST use iconography and colors that fit the existing card modal styling and keep `Remove` as the final action in the row.
- **FR-009**: Uploading files and removing attachments MUST continue to work after the new actions are added.
- **FR-010**: Reopening a card after attachment persistence MUST preserve download availability and view availability for each uploaded file according to its stored metadata.

### Key Entities *(include if feature involves data)*

- **Uploaded Attachment**: A card attachment created from a local file, including a filename, MIME type, size, created time, and a persisted browser-retrievable payload.
- **Attachment Action Set**: The row-level controls available for an attachment, including download, optional view, and remove.
- **Browser-Viewable File Type**: An uploaded file whose stored MIME type maps to a conservative set of formats that browsers commonly open inline, such as images, PDFs, text, audio, and video.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uploaded attachments always show a download action in the card modal once their payload is available.
- **SC-002**: Browser-viewable uploaded attachments open in a new tab without closing the current Strata session.
- **SC-003**: Non-viewable uploaded attachments never show a misleading view action.
- **SC-004**: Existing link attachment, upload, and remove flows continue to work in regression coverage.
