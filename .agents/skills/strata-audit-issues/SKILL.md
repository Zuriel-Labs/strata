---
name: strata-audit-issues
description: "Audit and correct prioritization and metadata for Strata Backlog Issues only. Use when the PM asks to audit, reprioritize, clean up, or validate the backlog."
---

# Audit the Strata Backlog

Read `AGENTS.md`, `.agents/strata-pipeline-policy.html`, the live Project fields, every Backlog Issue, and relevant duplicate or dependency evidence.

- Scope is strictly Status `Backlog`. Do not edit On Hold, In Progress, In Review, or Done cards.
- Verify every Backlog Issue is open, unassigned, has exactly one `type:feature` or `type:bug` label, accurate implementation area labels, and populated Priority, Impact, and Effort. Check the shared Actionable Issue contract: Blueprint wording must not reduce delivery to a design document. Report incomplete scope or acceptance criteria; a metadata-only audit does not silently rewrite product decisions.
- Reassess ordering by security/functionality criticality first, then Impact relative to Effort. P0 is reserved for urgent security, privacy, data-integrity, or application-blocking work.
- When invoked, apply justified Backlog-only metadata corrections without a second approval. Preserve Issue scope, body, Status, assignment, milestone, dependencies, and pipeline state.
- Never create labels, Project fields, statuses, Issues, branches, or PRs during an audit.
- Read every mutation back and report the before/after value and concise rationale. Report no-op audits explicitly.
