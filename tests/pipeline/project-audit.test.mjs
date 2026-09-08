import test from "node:test";
import assert from "node:assert/strict";

import { auditProjectState } from "../../.agents/skills/strata-pipeline-health/scripts/audit-project.mjs";

const fields = {
  fields: [
    { name: "Status", options: ["Backlog", "On Hold", "In Progress", "In Review", "Done"].map((name) => ({ name })) },
    { name: "Priority", options: ["P0", "P1", "P2", "P3"].map((name) => ({ name })) },
    { name: "Impact", options: ["High", "Medium", "Low"].map((name) => ({ name })) },
    { name: "Effort", options: ["XS", "S", "M", "L", "XL"].map((name) => ({ name })) },
  ],
};

function issue(number, status = "In Progress") {
  return {
    content: { type: "Issue", number },
    status,
    priority: "P1",
    impact: "High",
    effort: "M",
  };
}

function openIssue(number) {
  return {
    number,
    labels: [{ name: "type:maintenance" }, { name: "area:workflow" }],
    assignees: [{ login: "brimdor" }],
  };
}

test("accepts one fully governed active Issue", () => {
  const errors = auditProjectState({
    project: { title: "Strata", public: false, closed: false },
    fieldData: fields,
    itemData: { items: [issue(36)] },
    openIssues: [openIssue(36)],
    openPrs: [],
  });
  assert.deepEqual(errors, []);
});

test("rejects stale Project identity and multiple active Issues", () => {
  const errors = auditProjectState({
    project: { title: "Strata Development", public: false, closed: false },
    fieldData: fields,
    itemData: { items: [issue(36), issue(37)] },
    openIssues: [openIssue(36), openIssue(37)],
    openPrs: [],
  });
  assert.ok(errors.some((error) => error.includes("open private Zuriel-Labs/Strata Project #2")));
  assert.ok(errors.some((error) => error.includes("single-active-Issue violation")));
});

test("requires exact Quality verify evidence for In Review", () => {
  const errors = auditProjectState({
    project: { title: "Strata", public: false, closed: false },
    fieldData: fields,
    itemData: { items: [issue(36, "In Review")] },
    openIssues: [openIssue(36)],
    openPrs: [{ number: 37, body: "Refs #36", isDraft: false, statusCheckRollup: [] }],
  });
  assert.ok(errors.some((error) => error.includes("lacks successful Quality / verify evidence")));
});

test("accepts GitHub bootstrap check metadata when the run display name is Quality", () => {
  const errors = auditProjectState({
    project: { title: "Strata", public: false, closed: false },
    fieldData: fields,
    itemData: { items: [issue(36, "In Review")] },
    openIssues: [openIssue(36)],
    openPrs: [{
      number: 37,
      body: "Refs #36",
      isDraft: false,
      statusCheckRollup: [{
        name: "verify",
        workflowName: "CI",
        workflowDisplayName: "Quality",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      }],
    }],
  });
  assert.deepEqual(errors, []);
});
