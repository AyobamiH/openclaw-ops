#!/usr/bin/env node

import { execSync } from "node:child_process";

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function normalize(lines) {
  return lines
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasAny(changed, candidates) {
  return candidates.some((candidate) => changed.includes(candidate));
}

function hasAll(changed, candidates) {
  return candidates.every((candidate) => changed.includes(candidate));
}

const stagedOnly = process.argv.includes("--staged");
const diffCommand = stagedOnly
  ? "git diff --cached --name-only"
  : "git diff --name-only HEAD";

let changedFiles = [];
try {
  changedFiles = normalize(run(diffCommand));
} catch (error) {
  console.error("[doc-sync] Unable to read git diff.");
  console.error(String(error));
  process.exit(2);
}

const orchestratorTouched = changedFiles.filter(
  (path) =>
    path.startsWith("orchestrator/src/") ||
    path.startsWith("orchestrator/monitoring/") ||
    path.startsWith("orchestrator/test/") ||
    path === "orchestrator/Dockerfile" ||
    path === "orchestrator/docker-compose.yml" ||
    path === "orchestrator/orchestrator_config.json"
);

if (orchestratorTouched.length === 0) {
  console.log("[doc-sync] No orchestrator implementation/config changes detected.");
  process.exit(0);
}

const errors = [];

const requiredGlobal = ["docs/operations/orchestrator-status.md"];
if (!hasAll(changedFiles, requiredGlobal)) {
  errors.push(
    `Missing required status update file(s): ${requiredGlobal.join(", ")}\n` +
      "Reason: orchestrator implementation/config changed."
  );
}

const domainRules = [
  {
    name: "API/runtime changes",
    match: (path) => path.startsWith("orchestrator/src/"),
    requireAny: ["orchestrator/docs/API_REFERENCE.md"],
  },
  {
    name: "Deployment/runtime packaging changes",
    match: (path) =>
      path === "orchestrator/Dockerfile" ||
      path === "orchestrator/docker-compose.yml" ||
      path.startsWith("orchestrator/monitoring/"),
    requireAny: [
      "orchestrator/docs/DEPLOYMENT_GUIDE.md",
      "orchestrator/docs/DOCKER_DEPLOYMENT.md",
    ],
  },
  {
    name: "Test/load changes",
    match: (path) => path.startsWith("orchestrator/test/"),
    requireAny: ["orchestrator/docs/LOAD_TEST_REPORT.md"],
  },
];

for (const rule of domainRules) {
  const matched = orchestratorTouched.filter(rule.match);
  if (matched.length === 0) continue;

  if (!hasAny(changedFiles, rule.requireAny)) {
    errors.push(
      `Rule failed: ${rule.name}\n` +
        `Changed files:\n- ${matched.join("\n- ")}\n` +
        `Required doc update (any): ${rule.requireAny.join(", ")}`
    );
  }
}

if (errors.length > 0) {
  console.error("\n[doc-sync] ❌ Documentation coverage check failed.\n");
  for (const [index, issue] of errors.entries()) {
    console.error(`${index + 1}. ${issue}\n`);
  }
  console.error("Quick fix:");
  console.error("- Update the required doc files listed above.");
  console.error("- Then rerun: npm run docs:check-sync (inside orchestrator/)\n");
  process.exit(1);
}

console.log("[doc-sync] ✅ Documentation coverage check passed.");
console.log(`[doc-sync] Checked ${orchestratorTouched.length} orchestrator implementation/config file(s).`);
