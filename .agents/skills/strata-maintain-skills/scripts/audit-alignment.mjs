#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const pipelineSkillNames = [
  "strata-create-issue",
  "strata-audit-issues",
  "strata-work-issue",
  "strata-review-issue",
  "strata-release-canary",
  "strata-close-issue",
  "strata-release-production",
  "strata-pipeline-health",
  "strata-maintain-skills",
];
const sharedDesignSkillNames = [
  "awesome-design",
  "design-taste-frontend",
  "image-to-code",
  "playwright-cli",
  "web-design-guidelines",
];
const skillNames = [...pipelineSkillNames, ...sharedDesignSkillNames];
const errors = [];

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(content, needle, owner) {
  if (!content.includes(needle)) errors.push(`${owner} does not contain ${JSON.stringify(needle)}`);
}

function rejectText(content, needle, owner) {
  if (content.includes(needle)) errors.push(`${owner} must not contain ${JSON.stringify(needle)}`);
}

const agents = read("AGENTS.md");
const claude = read("CLAUDE.md").trim();
const gemini = read("GEMINI.md").trim();
const policy = read(".agents/strata-pipeline-policy.html");
const packageJson = JSON.parse(read("package.json") || "{}");

if (claude !== "@AGENTS.md") errors.push("CLAUDE.md must contain only @AGENTS.md");
if (gemini !== "@./AGENTS.md") errors.push("GEMINI.md must contain only @./AGENTS.md");
requireText(policy, "color-scheme: dark", ".agents/strata-pipeline-policy.html");
requireText(policy, "Approved to merge and deploy production", ".agents/strata-pipeline-policy.html");
requireText(policy, "without rebuilding", ".agents/strata-pipeline-policy.html");
requireText(agents, "Exactly one Issue may be active", "AGENTS.md");
requireText(agents, "github.com/Zuriel-Labs/strata", "AGENTS.md");
requireText(agents, "Project `Strata`, number `2`", "AGENTS.md");
requireText(agents, "no branch protection or repository ruleset", "AGENTS.md");
requireText(agents, "Production never rebuilds an approved candidate", "AGENTS.md");
requireText(agents, "image cleanup is mandatory", "AGENTS.md");
requireText(agents, "Never ask the PM to move a Project card", "AGENTS.md");
requireText(agents, "Every implementation, remediation, Canary, Production, and completion handoff must include numbered, change-specific PM testing steps.", "AGENTS.md");
requireText(agents, "standalone fenced code block", "AGENTS.md");
requireText(policy, "Agent-owned Project movement", ".agents/strata-pipeline-policy.html");
requireText(policy, "The PM never has to drag a card", ".agents/strata-pipeline-policy.html");
requireText(policy, "purges obsolete unreferenced Strata image manifests from Zot", ".agents/strata-pipeline-policy.html");
requireText(policy, "does not wait for Zot's delayed background garbage collection", ".agents/strata-pipeline-policy.html");
requireText(policy, "retained Production digest remains pullable", ".agents/strata-pipeline-policy.html");
requireText(policy, "PM testing steps", ".agents/strata-pipeline-policy.html");
requireText(policy, "standalone fenced code block", ".agents/strata-pipeline-policy.html");

const canaryRelease = read(".agents/skills/strata-release-canary/SKILL.md");
const productionRelease = read(".agents/skills/strata-release-production/SKILL.md");
const issueReview = read(".agents/skills/strata-review-issue/SKILL.md");
const issueClosure = read(".agents/skills/strata-close-issue/SKILL.md");
const skillMaintenance = read(".agents/skills/strata-maintain-skills/SKILL.md");
requireText(canaryRelease, "local development workstation", ".agents/skills/strata-release-canary/SKILL.md");
requireText(canaryRelease, "never on a Kubernetes node", ".agents/skills/strata-release-canary/SKILL.md");
requireText(canaryRelease, "main` container", ".agents/skills/strata-release-canary/SKILL.md");
requireText(canaryRelease, "/api/health", ".agents/skills/strata-release-canary/SKILL.md");
requireText(productionRelease, "strata-data", ".agents/skills/strata-release-production/SKILL.md");
requireText(productionRelease, "SQLite integrity", ".agents/skills/strata-release-production/SKILL.md");
requireText(productionRelease, "Purge obsolete unreferenced Strata image manifests from Zot", ".agents/skills/strata-release-production/SKILL.md");
for (const [owner, content] of [
  [".agents/skills/strata-review-issue/SKILL.md", issueReview],
  [".agents/skills/strata-release-canary/SKILL.md", canaryRelease],
  [".agents/skills/strata-close-issue/SKILL.md", issueClosure],
  [".agents/skills/strata-release-production/SKILL.md", productionRelease],
  [".agents/skills/strata-maintain-skills/SKILL.md", skillMaintenance],
]) {
  requireText(content, "PM testing steps", owner);
}
for (const [owner, content] of [
  [".agents/skills/strata-review-issue/SKILL.md", issueReview],
  [".agents/skills/strata-release-canary/SKILL.md", canaryRelease],
  [".agents/skills/strata-maintain-skills/SKILL.md", skillMaintenance],
]) {
  requireText(content, "standalone fenced code block", owner);
}
for (const [owner, content] of [
  ["AGENTS.md", agents],
  [".agents/strata-pipeline-policy.html", policy],
  [".agents/skills/strata-release-canary/SKILL.md", canaryRelease],
  [".agents/skills/strata-release-production/SKILL.md", productionRelease],
]) {
  rejectText(content, "cyndaquil", owner);
  rejectText(content, "github.com/Broville/strata", owner);
  rejectText(content, "Versa Development", owner);
}

const transitionContracts = {
  "strata-create-issue": "never ask the PM to add or move the card",
  "strata-work-issue": "agent-owned Project transition",
  "strata-review-issue": "agent-owned Project transition",
  "strata-close-issue": "agent-owned Project transition",
};
for (const [skillName, contract] of Object.entries(transitionContracts)) {
  requireText(read(`.agents/skills/${skillName}/SKILL.md`), contract, `.agents/skills/${skillName}/SKILL.md`);
}

for (const skillName of pipelineSkillNames) {
  requireText(agents, `\`${skillName}\``, "AGENTS.md");
}
for (const skillName of sharedDesignSkillNames) {
  requireText(agents, `\`${skillName}\``, "AGENTS.md");
}

for (const skillName of skillNames) {
  const canonicalRelative = `.agents/skills/${skillName}/SKILL.md`;
  const canonical = read(canonicalRelative);
  const frontmatter = canonical.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) {
    errors.push(`${canonicalRelative} has invalid frontmatter`);
  } else {
    requireText(frontmatter[1], `name: ${skillName}`, canonicalRelative);
    if (!/^description:\s*.+$/m.test(frontmatter[1])) errors.push(`${canonicalRelative} has no description`);
  }
  const adapterRelative = `.claude/skills/${skillName}/SKILL.md`;
  const adapterPath = path.join(repoRoot, adapterRelative);
  const adapter = read(adapterRelative);
  if (fs.existsSync(adapterPath) && fs.lstatSync(adapterPath).isSymbolicLink()) {
    errors.push(`${adapterRelative} must be a regular file, not a symlink`);
  }
  requireText(adapter, `name: ${skillName}`, adapterRelative);
  requireText(adapter, `../../../.agents/skills/${skillName}/SKILL.md`, adapterRelative);
}

const canonicalRoot = path.join(repoRoot, ".agents/skills");
if (fs.existsSync(canonicalRoot)) {
  const actual = fs.readdirSync(canonicalRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = [...skillNames].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`canonical skill registry mismatch: expected ${expected.join(", ")}; found ${actual.join(", ")}`);
  }
}

if (packageJson.scripts?.["skills:check"] !== "node .agents/skills/strata-maintain-skills/scripts/audit-alignment.mjs") {
  errors.push("package.json skills:check is missing or misaligned");
}
if (!packageJson.scripts?.check?.includes("npm run skills:check")) {
  errors.push("package.json check must include skills:check");
}
if (packageJson.scripts?.["pipeline:test"] !== "node --test tests/pipeline/*.test.mjs") {
  errors.push("package.json pipeline:test is missing or misaligned");
}
if (packageJson.scripts?.["pipeline:health"] !== "node .agents/skills/strata-pipeline-health/scripts/audit-project.mjs") {
  errors.push("package.json pipeline:health is missing or misaligned");
}
if (!packageJson.scripts?.check?.includes("npm run pipeline:test") || !packageJson.scripts?.check?.includes("npm run test:ci")) {
  errors.push("package.json check must include pipeline:test and test:ci");
}

for (const relativePath of [
  ".agents/skills/strata-release-canary/scripts/check-candidate.mjs",
  ".agents/skills/strata-release-canary/scripts/verify-live.mjs",
  ".agents/skills/strata-pipeline-health/scripts/audit-project.mjs",
]) {
  read(relativePath);
}

if (errors.length) {
  console.error(`Strata skill alignment failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Strata skill alignment OK: ${pipelineSkillNames.length} workflow skills, ${sharedDesignSkillNames.length} shared design skills, ${skillNames.length} Claude adapters.`);
