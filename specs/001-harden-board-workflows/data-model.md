# Data Model: Strata Board Workflow Hardening

## BoardLabel

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique within the board label set |
| `name` | string | Non-empty, trimmed, board-visible name |
| `color` | string | Existing visual token or hex color string |

**Validation Rules**
- Names must be non-empty after trimming.
- Label IDs referenced by cards or automation conditions must belong to the board's current label set.
- Each board retains at least a valid array of labels; new and existing boards start with three defaults.

## BoardLabelSet

| Field | Type | Notes |
|-------|------|-------|
| `boardId` | string | Owning board |
| `labels` | `BoardLabel[]` | Persisted in `boards.labels_json` |

**State Transitions**
- `seeded` -> `edited` when a default label is renamed or recolored.
- `active` -> `removed` when a board admin deletes a label.

## CardLabelAssignment

| Field | Type | Notes |
|-------|------|-------|
| `cardId` | string | Card receiving the label |
| `labelId` | string | Must resolve to a `BoardLabel` on the same board |

**Validation Rules**
- Archived cards are excluded from scheduled automation targeting.
- Removed labels must also be removed from card `labelIds` during board-label cleanup.

## AutomationConditions

| Field | Type | Notes |
|-------|------|-------|
| `listId` | string or null | Optional board list filter; null means any list |
| `labelId` | string or null | Optional board label filter; null means any labels |

**Validation Rules**
- `listId`, when present, must belong to the same board as the rule.
- `labelId`, when present, must belong to the same board as the rule.

## AutomationTriggerConfig

| Field | Type | Notes |
|-------|------|-------|
| `type` | enum | `card_moved`, `card_created`, `checklist_complete`, `date_time`, `weekday`, `monthly`, `heartbeat` |
| `toListId` | string or null | Used by `card_moved` trigger filtering |
| `runAt` | ISO timestamp or null | Used by one-time `date_time` trigger |
| `weekdays` | number[] | Used by `weekday` trigger, 0-6 |
| `time` | `HH:MM` or null | Used by `weekday` and `monthly` triggers |
| `dayOfMonth` | number or null | Used by `monthly`, 1-31 |
| `intervalValue` | number or null | Used by `heartbeat` |
| `intervalUnit` | `minutes` or `hours` or null | Used by `heartbeat` |

**Validation Rules**
- One-time triggers must point to a valid timestamp.
- Monthly triggers must use a valid day number.
- Heartbeat triggers must use a positive integer interval.

## AutomationRuleRecord

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Rule identifier |
| `boardId` | string | Owning board |
| `name` | string | Human-readable rule name |
| `trigger` | enum | Same values as `AutomationTriggerConfig.type` |
| `triggerConfig` | object | Trigger-specific settings |
| `conditions` | `AutomationConditions` | Saved list and label filters |
| `action` | enum | Existing supported actions |
| `actionConfig` | object | Action-specific settings |
| `enabled` | boolean | Rule enabled state |
| `lastRunAt` | ISO timestamp or null | Used by the server runner to avoid duplicate scheduled execution |

**State Transitions**
- `disabled` -> `enabled` when an admin activates the rule.
- `enabled` -> `executed` when a schedule fires and matching cards are processed.
- `enabled` remains unchanged when a schedule window arrives but no eligible cards match the saved conditions.

## PermissionScope

| Role | Board Labels | Card Labels/Members | Automations | Archive/Restore |
|------|--------------|---------------------|-------------|-----------------|
| `system_admin` | full | existing allowed behavior | full | full |
| `workspace_admin` | full within workspace | existing allowed behavior within workspace | full within workspace | full within workspace |
| `board_admin` | full within board | full within board | full within board | full within board |
| `member` | none | existing member-safe card interactions only | none | none |
| `observer` | none | read-only | none | none |
