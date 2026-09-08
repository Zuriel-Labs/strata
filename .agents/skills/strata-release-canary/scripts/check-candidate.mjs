#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const strataRepo = path.resolve(scriptDir, "../../../..");
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export function expectedImageReference(sourceSha, imageDigest) {
  return `10.0.20.11:32309/strata:${sourceSha.slice(0, 7)}@${imageDigest}`;
}

export function assertRenderedImage(rendered, expected) {
  const imageLines = rendered.split("\n").filter((line) => {
    const normalized = line.trim().replaceAll('"', "").replace(/^-\s*/, "");
    return normalized === `image: ${expected}`;
  });
  if (imageLines.length !== 1) throw new Error(`expected 1 rendered image reference for ${expected}; found ${imageLines.length}`);
  return imageLines.length;
}

function validateInputs(track, sourceSha, imageDigest, argumentCount) {
  if (!track || !sourceSha || !imageDigest || argumentCount > 7) {
    throw new Error("usage: check-candidate.mjs <canary|production> <full-source-sha> <sha256-digest> [homelab-repo]");
  }
  if (!new Set(["canary", "production"]).has(track)) throw new Error("release track must be canary or production");
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error("source SHA must be 40 lowercase hexadecimal characters");
  if (!/^sha256:[0-9a-f]{64}$/.test(imageDigest)) throw new Error("image digest must be a complete sha256 digest");
}

export function main(argv = process.argv) {
  const [, , track, sourceSha, imageDigest, explicitHomelabRepo] = argv;
  let temporaryChartRoot;
  try {
    validateInputs(track, sourceSha, imageDigest, argv.length);
    const homelabRepo = path.resolve(explicitHomelabRepo || path.join(strataRepo, "..", "homelab"));
    const chartName = track === "canary" ? "strata-canary" : "strata";
    const sourceChartDir = path.join(homelabRepo, "apps", chartName);
    temporaryChartRoot = fs.mkdtempSync(path.join(os.tmpdir(), `strata-${track}-chart-`));
    const chartDir = path.join(temporaryChartRoot, chartName);
    fs.cpSync(sourceChartDir, chartDir, { recursive: true });
    run("helm", ["dependency", "build", chartDir]);
    run("helm", ["lint", chartDir]);
    const rendered = run("helm", ["template", chartName, chartDir, "--namespace", chartName]);
    const expected = expectedImageReference(sourceSha, imageDigest);
    const renderedImageCount = assertRenderedImage(rendered, expected);

    console.log(`track=${track}`);
    console.log(`source_sha=${sourceSha}`);
    console.log(`image_digest=${imageDigest}`);
    console.log(`rendered_image_count=${renderedImageCount}`);
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message);
    return 1;
  } finally {
    if (temporaryChartRoot) fs.rmSync(temporaryChartRoot, { recursive: true, force: true });
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
