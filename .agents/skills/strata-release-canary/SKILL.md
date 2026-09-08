---
name: strata-release-canary
description: "Build the exact approved-for-review Strata PR head once, upload its immutable image to Zot, deploy Canary through homelab GitOps, and verify application and cluster health."
---

# Release Strata Canary

Read `AGENTS.md`, `.agents/strata-pipeline-policy.html`, the live Strata and homelab `AGENTS.md` files, and the selected Issue/PR. Canary deployment is authorized only as part of agent review for the sole active Issue.

1. Require a clean committed PR head, an open PR targeting `main`, Status In Progress, complete local gates, and successful `Quality / verify` for the exact head.
2. Build from an exact archive of that PR head in a fresh directory on the local development workstation, never from a dirty worktree and never on a Kubernetes node. Target `linux/amd64`, the cluster workload platform, using the local container runtime. Use the repository Dockerfile, tag `10.0.20.11:32309/strata:<seven-character-head>`, push to Zot with the required internal-registry transport, and resolve the registry `Docker-Content-Digest`. Do not infer the digest from a local image ID.
3. In `/Users/chris/Documents/Github/homelab`, preserve unrelated changes and confirm `origin` is Gitea. Update only the `main` container tag and digest in `apps/strata-canary/values.yaml`. Preserve the Canary hostname, session cookie, `SEED_DATA=false`, ephemeral `emptyDir` SQLite storage, probes, network policy, and resources.
4. Run Helm lint/render, targeted pre-commit, `git diff --check`, and `node .agents/skills/strata-release-canary/scripts/check-candidate.mjs canary <full-source-sha> <digest>` from the Strata repository.
5. Commit only the Canary values file, push Gitea `master`, refresh Argo CD, and wait for `strata-canary` to become Synced and Healthy at that exact homelab revision.
6. Run `node .agents/skills/strata-release-canary/scripts/verify-live.mjs canary <digest> <homelab-sha>`. Inspect startup/schema and `main` container logs, `/api/health`, external TLS/route behavior, events, restart count, and exact digest. Confirm Canary uses its isolated ephemeral SQLite path and never Production data. Authenticated Canary browser testing is optional when supported access already exists; otherwise skip it without blocking release, requesting credentials, or weakening authentication because local browser QA already proves application behavior.
7. Update the PR with Issue, exact head/tree, digest, homelab commit, CI, tests, health evidence, and the Production gate. The candidate is Issue + PR + head/tree + digest + Canary commit.
8. Return the complete handoff to `strata-review-issue`, including a numbered `PM testing steps` section with the Canary URL, prerequisites, exact actions, expected results, and regression checks for the actual diff. The handoff must present `Approved to merge and deploy production` in its own standalone fenced code block; inline text alone is insufficient.
9. Clean only isolated databases, tunnels, servers, Browser tabs, temporary manifests, kubeconfigs, and exact remote build directories created by this run.

Any source, dependency, schema, image, or rendered configuration change creates a new candidate. Never edit Production or merge the PR from this skill.
