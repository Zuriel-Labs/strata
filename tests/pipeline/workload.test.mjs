import test from "node:test";
import assert from "node:assert/strict";

import {
  assertStrataPod,
  main,
  warningsSinceReady,
  workloadPodSelector,
} from "../../.agents/skills/strata-release-canary/scripts/verify-live.mjs";

test("selects only the app-template main controller pod", () => {
  assert.equal(
    workloadPodSelector("strata"),
    "app.kubernetes.io/instance=strata,app.kubernetes.io/controller=main",
  );
});

test("treats pre-readiness warnings as resolved but blocks later or undated warnings", () => {
  const readyPod = {
    status: {
      conditions: [{
        type: "Ready",
        status: "True",
        lastTransitionTime: "2026-09-08T04:17:49Z",
      }],
    },
  };
  const resolvedWarning = { lastTimestamp: "2026-09-08T04:17:26Z" };
  const laterWarning = { eventTime: "2026-09-08T04:18:00Z" };

  assert.deepEqual(warningsSinceReady(readyPod, [resolvedWarning]), []);
  assert.deepEqual(warningsSinceReady(readyPod, [resolvedWarning, laterWarning]), [laterWarning]);
  assert.equal(warningsSinceReady(readyPod, [{}]).length, 1);
});

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

const revision = "a".repeat(40);

function liveRunner({ warnings = [], unhealthy = false } = {}) {
  const calls = [];
  const run = (binary, args) => {
    const key = args.join(" ");
    calls.push([binary, ...args]);
    if (binary === "curl") return '{"ok":true}';
    if (args[0] === "logs") return "Strata API listening";
    if (args[0] === "exec") return "200";
    if (args[1] === "application") return JSON.stringify({ status: {
      sync: { revision, status: "Synced" }, health: { status: "Healthy" },
      operationState: { phase: "Succeeded" },
    } });
    if (args[1] === "events") return JSON.stringify({ items: warnings });
    if (args[1] === "pods" && !args.includes("-A")) return JSON.stringify({ items: [pod(unhealthy ? {
      containerStatuses: [{ name: "main", ready: false, restartCount: 0, imageID: `registry/strata@${digest}` }],
    } : {})] });
    throw new Error(`unrelated cluster query: ${key}`);
  };
  return { run, calls };
}

test("Canary handoff checks only Strata and never queries unrelated cluster health", () => {
  const { run, calls } = liveRunner();
  assert.equal(main(["canary", digest, revision], run), 0);
  assert.ok(calls.some(([binary]) => binary === "curl"));
  assert.ok(calls.some(([, verb]) => verb === "logs"));
  assert.ok(calls.some(([, verb]) => verb === "exec"));
});

test("Canary still rejects Strata warnings and unhealthy containers", () => {
  assert.throws(() => main(["canary", digest, revision], liveRunner({ warnings: [{}] }).run), /Strata warnings/);
  assert.throws(() => main(["canary", digest, revision], liveRunner({ unhealthy: true }).run), /not ready/);
});

test("Production retains the existing whole-cluster gate", () => {
  assert.throws(() => main(["production", digest, revision], liveRunner().run), /unrelated cluster query: get nodes/);
});
