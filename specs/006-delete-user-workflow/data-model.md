# Data Model: Admin User Deletion Workflow

## Entities

### Managed User
- **Purpose**: The account being edited or deleted by a system admin.
- **Fields Used**: `id`, `name`, `initials`, `color`, `username`, `platformRole`, `active`, authentication artifacts, workspace memberships, board memberships.
- **Deletion Rules**:
  - Cannot be deleted if it is the currently authenticated admin.
  - Cannot be deleted if it is the last remaining active `system_admin`.
  - On successful deletion, direct access records must be removed.

### Delete Confirmation State
- **Purpose**: Tracks the admin panel's destructive confirmation flow.
- **Fields**:
  - `userId`: target user ID locked for the current delete flow
  - `username`: target username shown in the warning copy
  - `step`: `warning` or `confirm`
  - `confirmationText`: raw input used to validate exact `DELETE`
  - `submitting`: whether the delete request is in flight
  - `error`: latest delete failure message, if any
- **State Transitions**:
  - `idle -> warning` when `Delete User` is activated
  - `warning -> idle` on `Nevermind`
  - `warning -> confirm` on `YES`
  - `confirm -> idle` on `CANCEL` or successful delete

### Live User Reference
- **Purpose**: Any persisted reference that should not continue to point to a deleted user.
- **Sources**:
  - `sessions.user_id`
  - `recovery_keys.user_id`
  - `password_resets.user_id`
  - `workspace_memberships.user_id`
  - `board_memberships.user_id`
  - `notifications.user_id`
  - `cards.member_ids_json[]`
  - `automation_rules.action_config_json.memberId` for `assign_member`
- **Deletion Rule**: Must be deleted, removed, or neutralized during the same delete operation.

### Preserved Historical Artifact
- **Purpose**: Created work that remains after the user account is deleted.
- **Sources**:
  - `cards`
  - `cards.comments_json[]`
  - `cards.activity_json[]`
  - `cards.attachments_json[]`
  - `audit_events`
- **Display Rule**: If the original `userId` no longer resolves to an active user, clients render a neutral deleted-user fallback.

## Derived Cleanup Summary
- **Inputs**: target user ID, actor user ID
- **Outputs**:
  - deleted user ID and username
  - count of card assignments removed
  - count of automation rules remediated
  - audit metadata describing cleanup
