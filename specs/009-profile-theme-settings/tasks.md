# Tasks: Profile Theme Settings (009-profile-theme-settings)

## Phase 1: Setup
- [x] T001 [P] Review the existing theme, header, auth-session, and profile overlay flows referenced in `src/App.tsx`, `src/components/Header.tsx`, `src/components/ProfileOverlay.tsx`, and `server/src/routes/auth-routes.ts`

## Phase 2: Foundation
- [x] T002 [US1] Add shared type support for user theme preference in `src/types.ts` and any corresponding server-side session typing used by `server/src/db/repositories.ts`
- [x] T003 [US1] Add a startup-safe `theme_preference` user migration and session payload hydration in `server/src/db/schema.ts` and `server/src/db/repositories.ts`
- [x] T004 [US2] Add authenticated self-service profile and preferences routes with validation in `server/src/routes/auth-routes.ts`
- [x] T005 [US2] Add client service helpers and auth refresh wiring for profile and preferences updates in `src/services/session.ts` and `src/lib/auth-context.tsx`

## Phase 3: User Story 1 - Readable themes for daily work (Priority: P1)
- [x] T006 [US1] Replace hard-coded app theme values with dark and light semantic theme tokens in `src/App.tsx` and `src/index.css`
- [x] T007 [US1] Tune shared shell, header, menu, and overlay contrast so titles and labels remain readable in both themes in `src/components/Header.tsx`, `src/components/ProfileOverlay.tsx`, and `src/App.css`
- [x] T008 [US1] Ensure the authenticated shell restores the saved theme preference on load and after refresh in `src/App.tsx` and `src/lib/auth-context.tsx`

## Phase 4: User Story 2 - Manage personal profile and preferences from the avatar menu (Priority: P2)
- [x] T009 [US2] Refactor the top-right avatar interaction into a root menu with `Profile`, `Preferences`, `Security`, and `Sign Out` entries in `src/components/Header.tsx` and `src/components/ProfileOverlay.tsx`
- [x] T010 [US2] Add consistent sub-overlay headers with back and close controls plus overlay view-state management in `src/components/ProfileOverlay.tsx`
- [x] T011 [US2] Implement the `Profile` form for display name, initials, and avatar color with save validation and immediate session refresh in `src/components/ProfileOverlay.tsx` and `src/services/session.ts`
- [x] T012 [US2] Implement the `Preferences` form for dark or light theme selection with immediate apply and persisted save behavior in `src/components/ProfileOverlay.tsx`, `src/App.tsx`, and `src/services/session.ts`

## Phase 5: User Story 3 - Manage account security and sign out safely (Priority: P3)
- [x] T013 [US3] Implement the `Security` sub-overlay with current password, new password, confirm password, `Change`, and `Cancel` flows in `src/components/ProfileOverlay.tsx`
- [x] T014 [US3] Reuse the existing auth password-change behavior to show clear validation and success or error states in `src/components/ProfileOverlay.tsx` and `src/lib/auth-context.tsx`
- [x] T015 [US3] Ensure `Sign Out` closes account overlays, clears session state, and returns users to login through the existing auth flow in `src/components/ProfileOverlay.tsx` and `src/lib/auth-context.tsx`

## Phase 6: Regression Coverage
- [x] T016 [US1] Add client regression coverage for theme restoration and account-menu interactions in `src/App.auth.test.tsx`
- [x] T017 [US2] Add server integration coverage for self-service profile and preferences updates plus theme persistence in `server/tests/auth-routes.test.ts`
- [x] T018 [US3] Extend end-to-end coverage for menu navigation, profile save, theme switching, password validation, and sign out in `tests/e2e/app.spec.ts`

## Phase 7: Polish
- [x] T019 [P] Verify focus treatment, contrast, and touch-target sizing across the account overlay states in `src/index.css` and `src/components/ProfileOverlay.tsx`
- [x] T020 [P] Run targeted lint and auth-related test validation from the existing scripts referenced in `package.json`
