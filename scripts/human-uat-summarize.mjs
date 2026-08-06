#!/usr/bin/env node
/**
 * Build an anonymized human-UAT summary from validated participant result JSON files.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));

if (options.help || options.inputs.length === 0) {
  process.stdout.write(
    [
      "Usage: node scripts/human-uat-summarize.mjs --out <summary.md> <result.json> [...]",
      "",
      "Validates each result, then writes an anonymized Markdown summary.",
      "Does not fabricate participant outcomes.",
      ""
    ].join("\n")
  );
  process.exit(options.help ? 0 : 1);
}

const validator = resolve(repoRoot, "scripts/human-uat-validate-result.mjs");
const validate = spawnSync(process.execPath, [validator, ...options.inputs], {
  encoding: "utf8"
});
if (validate.status !== 0) {
  process.stderr.write(validate.stdout || "");
  process.stderr.write(validate.stderr || "");
  process.exit(validate.status ?? 1);
}

const results = options.inputs.map((file) => JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")));
const taskIds = [
  "UAT-HUMAN-1",
  "UAT-HUMAN-2",
  "UAT-HUMAN-3",
  "UAT-HUMAN-4",
  "UAT-HUMAN-5",
  "UAT-HUMAN-6",
  "UAT-HUMAN-7",
  "UAT-HUMAN-8"
];

const roleCounts = Object.fromEntries(
  ["ai-assisted-individual", "experienced-engineer", "team-devops"].map((role) => [
    role,
    results.filter((row) => row.participantRole === role).length
  ])
);
const completedByTask = Object.fromEntries(
  taskIds.map((id) => [
    id,
    results.filter((row) => row.tasks.some((task) => task.id === id && task.completed)).length
  ])
);
const trustMisses = results.flatMap((row, index) => {
  const misses = Object.entries(row.trustComprehension)
    .filter(([, ok]) => ok === false)
    .map(([key]) => key);
  return misses.length === 0 ? [] : [`P${index + 1} (${row.participantRole}): ${misses.join(", ")}`];
});
const blockingFriction = results.flatMap((row, index) => {
  const blocked = Object.entries(row.friction)
    .filter(([, level]) => level === "blocking")
    .map(([key]) => key);
  return blocked.length === 0 ? [] : [`P${index + 1} (${row.participantRole}): ${blocked.join(", ")}`];
});
const linkedIssues = [...new Set(results.flatMap((row) => row.linkedIssues ?? []))];
const anyAbandonment = results.some((row) => row.abandonment);
const anyMistakenTrust = results.some((row) => row.mistakenTrustInterpretation);
const allTasksComplete = taskIds.every((id) => completedByTask[id] === results.length);
const decision =
  !anyAbandonment && !anyMistakenTrust && results.length >= 3 && allTasksComplete ? "pass" : "fail";

const markdown = [
  "# Human UAT summary",
  "",
  `- Kit version: ${unique(results.map((row) => row.kitVersion)).join(", ") || "n/a"}`,
  `- Date: ${unique(results.map((row) => row.sessionDate).filter(Boolean)).join(", ") || new Date().toISOString().slice(0, 10)}`,
  `- Participants (anonymized roles only): ${results.length} total — ai-assisted=${roleCounts["ai-assisted-individual"]}, experienced=${roleCounts["experienced-engineer"]}, devops=${roleCounts["team-devops"]}`,
  `- Package identity: ${unique(results.map((row) => `${row.packageIdentity.source}@${row.packageIdentity.version}`)).join(", ")}`,
  `- Success threshold: ≥3 independent roles; all UAT-HUMAN-1..8 completed; no mistaken trust; no abandonment`,
  `- Tasks passed / failed: ${taskIds.map((id) => `${id} ${completedByTask[id]}/${results.length}`).join("; ")}`,
  `- Trust comprehension misses: ${trustMisses.length === 0 ? "none" : trustMisses.join("; ")}`,
  `- Installation / auth / docs friction (separate from analysis quality): ${
    blockingFriction.length === 0 ? "no blocking friction recorded" : blockingFriction.join("; ")
  }`,
  `- Linked blocker issues: ${linkedIssues.length === 0 ? "none" : linkedIssues.join(", ")}`,
  `- Decision: ${decision} for milestone gate`,
  "",
  "This summary was generated from validated participant JSON. It is not deterministic smoke output.",
  ""
];

const outPath = resolve(process.cwd(), options.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, markdown.join("\n"), "utf8");

const machinePath = options.jsonOut
  ? resolve(process.cwd(), options.jsonOut)
  : outPath.replace(/\.md$/i, ".json");
writeFileSync(
  machinePath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      humanEvidence: true,
      decision,
      participantCount: results.length,
      roleCounts,
      completedByTask,
      linkedIssues,
      generatedAt: new Date().toISOString()
    },
    null,
    2
  )}\n`,
  "utf8"
);

process.stdout.write(`wrote ${outPath}\nwrote ${machinePath}\ndecision=${decision}\n`);

function unique(values) {
  return [...new Set(values)];
}

function parseArgs(argv) {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  const parsed = { out: "human-uat-summary.md", jsonOut: undefined, help: false, inputs: [] };
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--out") {
      parsed.out = normalized[++index];
      continue;
    }
    if (arg === "--json-out") {
      parsed.jsonOut = normalized[++index];
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    parsed.inputs.push(arg);
  }
  return parsed;
}
