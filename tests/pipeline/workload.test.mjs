import test from "node:test";
import assert from "node:assert/strict";

import { assertStrataPod } from "../../.agents/skills/strata-release-canary/scripts/verify-live.mjs";

const digest = `sha256:${"c".repeat(64)}`;

function pod(overrides = {}) {
  return {
    metadata: { name: "strata-main-abc" },
    status: {
      phase: "Running",
      containerStatuses: [{ name: "main", ready: true, restartCount: 0, imageID: `registry/strata@${digest}` }],
      ...overrides,
    },
  };
}

test("accepts one ready zero-restart Strata main container on the exact digest", () => {
  assert.equal(assertStrataPod(pod(), digest), "main");
});

test("rejects the copied Versa multi-container topology", () => {
  assert.throws(
    () => assertStrataPod(pod({
      containerStatuses: [
        { name: "web", ready: true, restartCount: 0, imageID: `registry/strata@${digest}` },
        { name: "worker", ready: true, restartCount: 0, imageID: `registry/strata@${digest}` },
      ],
    }), digest),
    /exactly one main container/,
  );
});

test("rejects restarts and digest drift", () => {
  assert.throws(
    () => assertStrataPod(pod({ containerStatuses: [{ name: "main", ready: true, restartCount: 1, imageID: `registry/strata@${digest}` }] }), digest),
    /not ready on the exact digest with zero restarts/,
  );
  assert.throws(
    () => assertStrataPod(pod({ containerStatuses: [{ name: "main", ready: true, restartCount: 0, imageID: `registry/strata@sha256:${"d".repeat(64)}` }] }), digest),
    /not ready on the exact digest with zero restarts/,
  );
});
