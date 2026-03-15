# Quickstart: Management Menu Inline Editing

## Manual Verification

1. Start the app with `npm run dev`.
2. Sign in as a user who can manage at least one workspace and board.
3. Open the Management menu and verify the Workspaces tab.
4. Click a manageable workspace row, rename it, and submit with Enter.
5. Repeat the rename and submit by clicking outside the input.
6. Press Escape during an edit and confirm the saved title is restored.
7. Open the Boards tab, switch workspace context from the header when multiple workspaces exist, and confirm the board list updates.
8. Click a manageable board row, rename it, and submit with Enter and blur in separate passes.
9. Confirm create workspace, create board, delete workspace, delete board, and board starring still work.

## Automated Verification

1. Run `npx vitest run src/components/NavigationOverlay.test.tsx`.
2. Run `npx vitest run server/tests/crud-routes.test.ts server/tests/rbac-routes.test.ts`.
