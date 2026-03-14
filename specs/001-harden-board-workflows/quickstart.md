# Quickstart: Strata Board Workflow Hardening

## Prerequisites

1. Install dependencies with `npm install`.
2. Start the app with `npm run dev`.
3. Use seeded accounts from the existing test data to validate system admin, workspace admin, board admin, member, and observer roles.

## Scenario 1: Branding And Admin Visibility

1. Open the app and confirm the browser tab title shows `Strata`.
2. Sign in as a board member and verify automation controls plus archive or restore affordances are hidden.
3. Sign in as a board admin and verify the same controls are visible and functional.

## Scenario 2: Board Labels And Card UX

1. Open a board as board admin and use the top-right `Labels` control to add, edit, and delete labels.
2. Refresh the page and confirm the label set persists only on the edited board.
3. Open a card, use the visible `Labels` control to search and assign a board label, then click the applied label to remove it.
4. Use `Add a card`, press `Enter`, and confirm a new card appears without add or cancel buttons.

## Scenario 3: Scheduled Automation Rules

1. Create an automation rule using each new schedule type and save list or label conditions.
2. Refresh the page and confirm the rule configuration is still present.
3. Wait for or simulate the rule's scheduled execution and confirm only matching non-archived cards are updated.

## Focused Validation Commands

- `npm run lint`
- `npm run test`
- `npx vitest run server/tests/rbac-routes.test.ts`
- `npm run test:e2e`
