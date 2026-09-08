#!/usr/bin/env node

import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TRACKS = new Set(["canary", "production"]);
const BACKUP_MAX_AGE_MS = 90 * 60 * 1000;

function command(binary, args) {
  return execFileSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function kubectl(args) {
  return command("kubectl", args);
}

function kubectlJson(args) {
  return JSON.parse(kubectl(args));
}

export function assertStrataPod(pod, imageDigest) {
  const containers = pod.status?.containerStatuses || [];
  if (pod.status?.phase !== "Running" || containers.length !== 1 || containers[0]?.name !== "main") {
    throw new Error(`workload ${pod.metadata?.name || "unknown"} must have exactly one main container in Running phase`);
  }

  const main = containers[0];
  if (!main.ready || main.restartCount !== 0 || !main.imageID?.endsWith(`@${imageDigest}`)) {
    throw new Error("main container is not ready on the exact digest with zero restarts");
  }
  return main.name;
}

function verifyProductionData(namespace, podName) {
  const pvc = kubectlJson(["get", "pvc", "strata-data", "-n", namespace, "-o", "json"]);
  if (pvc.status?.phase !== "Bound" || !pvc.spec?.volumeName) {
    throw new Error(`Production PVC strata-data is not Bound: phase=${pvc.status?.phase || "unknown"}`);
  }

  const quickCheck = kubectl([
    "exec", "-n", namespace, podName, "-c", "main", "--",
    "node", "--input-type=module", "-e",
    'import Database from "better-sqlite3"; const db = new Database(process.env.STRATA_DB_FILE, { readonly: true, fileMustExist: true }); const result = db.pragma("quick_check", { simple: true }); db.close(); if (result !== "ok") throw new Error(`quick_check=${result}`); console.log(result);',
  ]);
  if (quickCheck !== "ok") throw new Error(`Production SQLite quick_check failed: ${quickCheck}`);

  const backup = kubectlJson(["get", "cronjob", "strata-backup", "-n", namespace, "-o", "json"]);
  if (backup.spec?.suspend === true || !backup.status?.lastSuccessfulTime) {
    throw new Error("Production backup CronJob is suspended or has no successful run");
  }
  const backupAge = Date.now() - Date.parse(backup.status.lastSuccessfulTime);
  if (!Number.isFinite(backupAge) || backupAge < 0 || backupAge > BACKUP_MAX_AGE_MS) {
    throw new Error(`Production backup is stale: lastSuccessfulTime=${backup.status.lastSuccessfulTime}`);
  }

  return {
    backupLastSuccessfulTime: backup.status.lastSuccessfulTime,
    pvc: pvc.metadata.name,
    volume: pvc.spec.volumeName,
  };
}

export function main(argv = process.argv.slice(2)) {
  const [track, imageDigest, homelabSha] = argv;
  if (argv.length !== 3 || !TRACKS.has(track)) {
    throw new Error("usage: verify-live.mjs <canary|production> <sha256-digest> <full-homelab-sha>");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(imageDigest) || !/^[0-9a-f]{40}$/.test(homelabSha)) {
    throw new Error("digest or homelab SHA format is invalid");
  }

  const appName = track === "canary" ? "strata-canary" : "strata";
  const namespace = appName;
  const application = kubectlJson(["get", "application", appName, "-n", "argocd", "-o", "json"]);
  const actualRevision = application.status?.sync?.revision;
  const sync = application.status?.sync?.status;
  const health = application.status?.health?.status;
  const operation = application.status?.operationState?.phase;
  if (actualRevision !== homelabSha || sync !== "Synced" || health !== "Healthy" || operation !== "Succeeded") {
    throw new Error(`Argo mismatch: revision=${actualRevision} sync=${sync} health=${health} operation=${operation}`);
  }

  const pods = kubectlJson([
    "get", "pods", "-n", namespace, "-l", `app.kubernetes.io/instance=${appName}`, "-o", "json",
  ]).items;
  if (pods.length !== 1) throw new Error(`expected one ${appName} pod; found ${pods.length}`);
  const pod = pods[0];
  assertStrataPod(pod, imageDigest);

  kubectl([
    "exec", "-n", namespace, pod.metadata.name, "-c", "main", "--",
    "node", "--input-type=module", "-e",
    'const port = process.env.STRATA_PORT || process.env.PORT || "8787"; const response = await fetch(`http://127.0.0.1:${port}/api/health`); if (!response.ok) throw new Error(`/api/health ${response.status}`); console.log(response.status);',
  ]);
  command("curl", [
    "--fail", "--silent", "--show-error", "--max-time", "15",
    `https://${track === "canary" ? "strata-canary" : "strata"}.eaglepass.io/api/health`,
  ]);

  kubectl(["logs", "-n", namespace, pod.metadata.name, "-c", "main", "--tail=200"]);

  const warnings = kubectlJson([
    "get", "events", "-n", namespace,
    "--field-selector", `involvedObject.name=${pod.metadata.name},type=Warning`, "-o", "json",
  ]).items.length;
  const nodes = kubectlJson(["get", "nodes", "-o", "json"]).items;
  const badNodes = nodes.filter((node) => {
    const conditions = node.status?.conditions || [];
    return conditions.find((condition) => condition.type === "Ready")?.status !== "True"
      || conditions.some((condition) => condition.type.endsWith("Pressure") && condition.status === "True");
  });
  const applications = kubectlJson(["get", "applications", "-n", "argocd", "-o", "json"]).items;
  const badApps = applications.filter((app) => app.status?.sync?.status !== "Synced" || app.status?.health?.status !== "Healthy");
  const allPods = kubectlJson(["get", "pods", "-A", "-o", "json"]).items;
  const badPods = allPods.filter((candidate) => {
    if (!["Running", "Succeeded"].includes(candidate.status?.phase)) return true;
    return candidate.status?.phase === "Running"
      && (candidate.status?.containerStatuses || []).some((container) => !container.ready);
  });
  const ceph = kubectl(["exec", "-n", "rook-ceph", "deploy/rook-ceph-tools", "--", "ceph", "health"]);
  if (warnings || badNodes.length || badApps.length || badPods.length || ceph !== "HEALTH_OK") {
    throw new Error(`all-green failed: warnings=${warnings} nodes=${badNodes.length} apps=${badApps.length} pods=${badPods.length} ceph=${ceph}`);
  }

  const production = track === "production" ? verifyProductionData(namespace, pod.metadata.name) : null;
  console.log(`track=${track}`);
  console.log(`homelab_revision=${actualRevision}`);
  console.log(`pod=${pod.metadata.name}`);
  console.log(`image_digest=${imageDigest}`);
  if (production) {
    console.log(`pvc=${production.pvc}`);
    console.log(`pvc_volume=${production.volume}`);
    console.log("sqlite_quick_check=ok");
    console.log(`backup_last_success=${production.backupLastSuccessfulTime}`);
  }
  console.log("health=green");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message);
    process.exitCode = 1;
  }
}
