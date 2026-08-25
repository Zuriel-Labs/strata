# Quickstart: Post-Beta Consistency and Drag Reliability

## Local setup

```bash
npm ci
npm run dev
```

Use seeded accounts only in the local test environment. Do not copy production or canary credentials into reports.

## Focused acceptance

1. Workspace isolation: create/select a workspace with no board, wait through session refresh, trigger visibility refresh, and verify the board remains null.
2. Due date: select August 27, verify modal/card/table/calendar, refresh, then execute tests with UTC, America/Chicago, and Pacific/Auckland timezones.
3. Drag preview: repeatedly cross first/middle/end card and lane boundaries, including empty lanes and rapid reversals; compare final visible gap with refreshed order.
4. Automation scope: switch workspace and board inside Automations for System, Workspace, Board Admin, and denied roles.

## Project-native validation

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:ci
npm audit --audit-level=high
```

## Canary evidence

- Exact source SHA, immutable image digest, and homelab canary commit.
- ArgoCD Synced/Healthy, rollout 1/1, zero restarts, health/TLS, logs and warning events.
- UI QA at 375px, 768px, and 1280px.
- Production image/config checked unchanged from `e2449765` promotion baseline.
