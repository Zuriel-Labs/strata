import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRenderedImage,
  expectedImageReference,
} from "../../.agents/skills/strata-release-canary/scripts/check-candidate.mjs";

const sourceSha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;

test("builds the Strata registry reference from the exact source and digest", () => {
  assert.equal(
    expectedImageReference(sourceSha, digest),
    `10.0.20.11:32309/strata:${"a".repeat(7)}@${digest}`,
  );
});

test("accepts exactly one rendered Strata image reference", () => {
  const expected = expectedImageReference(sourceSha, digest);
  const rendered = `containers:\n  - image: ${expected}\n`;
  assert.equal(assertRenderedImage(rendered, expected), 1);
});

test("rejects missing or duplicate rendered Strata image references", () => {
  const expected = expectedImageReference(sourceSha, digest);
  assert.throws(() => assertRenderedImage("", expected), /expected 1 rendered image reference/);
  assert.throws(
    () => assertRenderedImage(`image: ${expected}\nimage: ${expected}\n`, expected),
    /found 2/,
  );
});
