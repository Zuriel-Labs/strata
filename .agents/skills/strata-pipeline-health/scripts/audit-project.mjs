#!/usr/bin/env node

import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const OWNER = "Zuriel-Labs";
const REPO = `${OWNER}/strata`;
const PROJECT_NUMBER = "2";
const ACTIVE = new Set(["In Progress", "In Review"]);
const REQUIRED_STATUS = ["Backlog", "On Hold", "In Progress", "In Review", "Done"];
const REQUIRED_FIELDS = {
  Priority: ["P0", "P1", "P2", "P3"],
  Impact: ["High", "Medium", "Low"],
  Effort: ["XS", "S", "M", "L", "XL"],
};

function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`gh ${args.join(" ")} failed: ${detail}`);
  }
}

function ghJson(args) {
  const output = gh(args);
  return output ? JSON.parse(output) : {};
}

export function auditProjectState({ project, fieldData, itemData, openIssues, openPrs, repoSettings, rulesets }) {
  const errors = [];
  if (project.title !== "Strata" || project.public !== false || project.closed !== false) {
    errors.push("Project must be the open private Zuriel-Labs/Strata Project #2");
  }

  if (repoSettings) {
    if (!repoSettings.allow_squash_merge || repoSettings.allow_merge_commit || repoSettings.allow_rebase_merge || !repoSettings.delete_branch_on_merge) {
      errors.push("repository must use squash-only merging with automatic merged-branch deletion");
    }
  }
  if (rulesets && rulesets.length !== 0) errors.push("Strata must not have a repository or inherited ruleset");

  const fields = new Map(fieldData.fields.map((field) => [field.name, field]));
  const statusOptions = fields.get("Status")?.options?.map((option) => option.name) ?? [];
  if (JSON.stringify(statusOptions) !== JSON.stringify(REQUIRED_STATUS)) {
    errors.push(`Status options mismatch: ${statusOptions.join(", ")}`);
  }
  for (const [fieldName, expectedOptions] of Object.entries(REQUIRED_FIELDS)) {
    const options = fields.get(fieldName)?.options?.map((option) => option.name) ?? [];
    if (JSON.stringify(options) !== JSON.stringify(expectedOptions)) {
      errors.push(`${fieldName} options mismatch: ${options.join(", ")}`);
    }
  }

  const foreignIssues = itemData.items.filter((item) => item.content?.type === "Issue"
    && item.repository
    && item.repository !== `https://github.com/${REPO}`);
  for (const item of foreignIssues) errors.push(`foreign Project Issue detected: ${item.repository}#${item.content.number}`);
  const issueItems = itemData.items.filter((item) => item.content?.type === "Issue" && !foreignIssues.includes(item));
  const itemByNumber = new Map(issueItems.map((item) => [item.content.number, item]));

  for (const issue of openIssues) {
    const item = itemByNumber.get(issue.number);
    if (!item) {
      errors.push(`open Issue #${issue.number} is missing from the Project`);
      continue;
    }
    for (const fieldName of ["status", "priority", "impact", "effort"]) {
      if (!item[fieldName]) errors.push(`Issue #${issue.number} is missing ${fieldName}`);
    }
    const labelNames = issue.labels.map((label) => label.name);
    const typeLabels = labelNames.filter((name) => name.startsWith("type:"));
    const areaLabels = labelNames.filter((name) => name.startsWith("area:"));
    if (typeLabels.length !== 1) errors.push(`Issue #${issue.number} must have exactly one type label`);
    if (areaLabels.length < 1) errors.push(`Issue #${issue.number} must have at least one area label`);
    if (ACTIVE.has(item.status)) {
      const assignees = issue.assignees.map((assignee) => assignee.login);
      if (assignees.length !== 1 || assignees[0] !== "brimdor") {
        errors.push(`active Issue #${issue.number} must be assigned only to brimdor`);
      }
    } else if (item.status === "Backlog" && issue.assignees.length !== 0) {
      errors.push(`Backlog Issue #${issue.number} must be unassigned`);
    }
  }

  const activeItems = issueItems.filter((item) => ACTIVE.has(item.status));
  if (activeItems.length > 1) {
    errors.push(`single-active-Issue violation: ${activeItems.map((item) => `#${item.content.number}`).join(", ")}`);
  }

  const autoClosePattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+/i;
  for (const pr of openPrs) {
    if (autoClosePattern.test(pr.body || "")) errors.push(`PR #${pr.number} contains a forbidden auto-close keyword`);
    const refs = [...(pr.body || "").matchAll(/\bRefs\s+#(\d+)/gi)].map((match) => Number(match[1]));
    if (!refs.length) errors.push(`PR #${pr.number} does not reference an Issue with Refs #N`);
    for (const issueNumber of refs) {
      if (!itemByNumber.has(issueNumber)) errors.push(`PR #${pr.number} references Issue #${issueNumber}, which is not in the Project`);
    }
  }

  for (const item of activeItems.filter((candidate) => candidate.status === "In Review")) {
    const matching = openPrs.filter((pr) => new RegExp(`\\bRefs\\s+#${item.content.number}\\b`, "i").test(pr.body || ""));
    if (matching.length !== 1) {
      errors.push(`In Review Issue #${item.content.number} must have exactly one open referenced PR`);
      continue;
    }
    const pr = matching[0];
    if (pr.isDraft) errors.push(`In Review PR #${pr.number} must be ready for review`);
    const verify = (pr.statusCheckRollup || []).find((check) => check.name === "verify"
      && (check.workflowDisplayName || check.workflowName) === "Quality");
    if (!verify || verify.status !== "COMPLETED" || verify.conclusion !== "SUCCESS") {
      errors.push(`In Review PR #${pr.number} lacks successful Quality / verify evidence`);
    }
  }

  return errors;
}

export function main() {
  const project = ghJson(["project", "view", PROJECT_NUMBER, "--owner", OWNER, "--format", "json"]);
  const fieldData = ghJson(["project", "field-list", PROJECT_NUMBER, "--owner", OWNER, "--format", "json"]);
  const itemData = ghJson(["project", "item-list", PROJECT_NUMBER, "--owner", OWNER, "--limit", "100", "--format", "json"]);
  const openIssues = ghJson(["issue", "list", "--repo", REPO, "--state", "open", "--limit", "100", "--json", "number,title,labels,assignees,url"]);
  const openPrs = ghJson(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "100", "--json", "number,title,body,isDraft,headRefName,headRefOid,baseRefName,statusCheckRollup,url"]);
  for (const pr of openPrs) {
    for (const check of pr.statusCheckRollup || []) {
      const runId = check.detailsUrl?.match(/\/actions\/runs\/(\d+)/)?.[1];
      if (runId) check.workflowDisplayName = ghJson(["api", `repos/${REPO}/actions/runs/${runId}`]).name;
    }
  }
  const repoSettings = ghJson(["api", `repos/${REPO}`]);
  const rulesets = ghJson(["api", `repos/${REPO}/rulesets?includes_parents=true`]);
  const errors = auditProjectState({ project, fieldData, itemData, openIssues, openPrs, repoSettings, rulesets });

  if (errors.length) {
    console.error(`Strata pipeline health failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  const issueItems = itemData.items.filter((item) => item.content?.type === "Issue");
  const activeItems = issueItems.filter((item) => ACTIVE.has(item.status));
  const activeSummary = activeItems.length ? `#${activeItems[0].content.number} ${activeItems[0].status}` : "none";
  console.log(`Strata pipeline health OK: ${openIssues.length} open Issue(s), active=${activeSummary}, ${openPrs.length} open PR(s).`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
