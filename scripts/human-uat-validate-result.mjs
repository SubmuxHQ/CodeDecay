#!/usr/bin/env node
/**
 * Validate a human UAT participant result against docs/evals/uat-kit/result.schema.json.
 * Does not invent participant outcomes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const schemaPath = resolve(repoRoot, "docs/evals/uat-kit/result.schema.json");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  process.stdout.write(
    [
      "Usage: node scripts/human-uat-validate-result.mjs <result.json> [...]",
      "",
      "Validates participant result files against the kit schema.",
      "Blank templates under docs/evals/uat-kit/result-templates/ intentionally fail until filled.",
      ""
    ].join("\n")
  );
  process.exit(args.length === 0 ? 1 : 0);
}

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const expectedTaskIds = [
  "UAT-HUMAN-1",
  "UAT-HUMAN-2",
  "UAT-HUMAN-3",
  "UAT-HUMAN-4",
  "UAT-HUMAN-5",
  "UAT-HUMAN-6",
  "UAT-HUMAN-7",
  "UAT-HUMAN-8"
];
const frictionKeys = [
  "install",
  "authenticationProvider",
  "packageManager",
  "terminal",
  "mcp",
  "documentation",
  "analysisQuality"
];
const trustKeys = [
  "deterministicEvidence",
  "runtimeToolProof",
  "memory",
  "aiSuggestion",
  "unverified",
  "needsHuman",
  "verified"
];

let failed = 0;
for (const file of args) {
  const path = resolve(process.cwd(), file);
  const errors = validateResult(JSON.parse(readFileSync(path, "utf8")));
  if (errors.length === 0) {
    process.stdout.write(`ok ${path}\n`);
    continue;
  }
  failed += 1;
  process.stderr.write(`fail ${path}\n`);
  for (const error of errors) {
    process.stderr.write(`  - ${error}\n`);
  }
}

process.exitCode = failed === 0 ? 0 : 1;

function validateResult(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["root must be an object"];
  }

  if (value.schemaVersion !== schema.properties.schemaVersion.const) {
    errors.push(`schemaVersion must be ${schema.properties.schemaVersion.const}`);
  }
  if (value.humanEvidence !== true) {
    errors.push("humanEvidence must be true for real participant records");
  }
  if (typeof value.kitVersion !== "string" || value.kitVersion.trim() === "") {
    errors.push("kitVersion is required");
  }
  if (!["ai-assisted-individual", "experienced-engineer", "team-devops"].includes(value.participantRole)) {
    errors.push("participantRole is invalid");
  }
  if (typeof value.abandonment !== "boolean") {
    errors.push("abandonment must be boolean");
  }
  if (typeof value.mistakenTrustInterpretation !== "boolean") {
    errors.push("mistakenTrustInterpretation must be boolean");
  }
  if (value.mistakenTrustInterpretation === true) {
    errors.push("session fails kit gate when mistakenTrustInterpretation is true");
  }

  const packageIdentity = value.packageIdentity;
  if (!packageIdentity || typeof packageIdentity !== "object") {
    errors.push("packageIdentity is required");
  } else {
    if (!["npm", "packed-tarball"].includes(packageIdentity.source)) {
      errors.push("packageIdentity.source must be npm or packed-tarball");
    }
    if (typeof packageIdentity.version !== "string" || packageIdentity.version.trim() === "") {
      errors.push("packageIdentity.version is required");
    }
  }

  if (!Array.isArray(value.tasks) || value.tasks.length < 8) {
    errors.push("tasks must include all eight UAT-HUMAN entries");
  } else {
    const ids = value.tasks.map((task) => task?.id);
    for (const id of expectedTaskIds) {
      if (!ids.includes(id)) errors.push(`missing task ${id}`);
    }
    for (const [index, task] of value.tasks.entries()) {
      if (!task || typeof task !== "object") {
        errors.push(`tasks[${index}] must be an object`);
        continue;
      }
      if (typeof task.completed !== "boolean") errors.push(`tasks[${index}].completed must be boolean`);
      if (!Number.isInteger(task.attempts) || task.attempts < 0) {
        errors.push(`tasks[${index}].attempts must be a non-negative integer`);
      }
      if (typeof task.timeSeconds !== "number" || task.timeSeconds < 0) {
        errors.push(`tasks[${index}].timeSeconds must be a non-negative number`);
      }
      for (const optionalInt of ["clarificationRequests", "unsafeActions", "commandFailures"]) {
        if (task[optionalInt] !== undefined && (!Number.isInteger(task[optionalInt]) || task[optionalInt] < 0)) {
          errors.push(`tasks[${index}].${optionalInt} must be a non-negative integer when set`);
        }
      }
    }
  }

  const trust = value.trustComprehension;
  if (!trust || typeof trust !== "object") {
    errors.push("trustComprehension is required");
  } else {
    for (const key of trustKeys) {
      if (typeof trust[key] !== "boolean") {
        errors.push(`trustComprehension.${key} must be boolean`);
      }
    }
  }

  const friction = value.friction;
  if (!friction || typeof friction !== "object") {
    errors.push("friction is required");
  } else {
    for (const key of frictionKeys) {
      if (!["none", "minor", "blocking"].includes(friction[key])) {
        errors.push(`friction.${key} must be none|minor|blocking`);
      }
    }
  }

  if (value.linkedIssues !== undefined) {
    if (!Array.isArray(value.linkedIssues) || value.linkedIssues.some((item) => typeof item !== "string")) {
      errors.push("linkedIssues must be an array of strings");
    }
  }

  return errors;
}
