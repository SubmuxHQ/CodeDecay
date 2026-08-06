#!/usr/bin/env node
/**
 * Deterministic human-UAT workflow smoke for CI drift detection.
 * Explicitly NOT independent human acceptance evidence for issue 692.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunId, readOptionValue, splitCommand } from "./lib/args.mjs";
import { resetDir, writeJsonFile } from "./lib/files.mjs";
import { runCommand } from "./lib/process.mjs";
import { HUMAN_UAT_TASK_IDS } from "./fixtures/human-uat/repos.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const runId = options.runId ?? createRunId();
const runDir = resolve(repoRoot, options.outputDir ?? `.codedecay/local/human-uat/smoke/${runId}`);
const fixtureRoot = join(runDir, "fixtures");
const kitRoot = join(repoRoot, "docs/evals/uat-kit");
const cliCommand = options.cli
  ? splitCommand(options.cli)
  : ["node", join(repoRoot, "packages/cli/dist/index.js")];

if (options.help) {
  printHelp();
  process.exit(0);
}

assertBuiltCli();
resetDir(runDir);
mkdirSync(fixtureRoot, { recursive: true });

const checks = [];
const report = {
  schemaVersion: 1,
  tool: "CodeDecay human-UAT deterministic smoke",
  humanEvidence: false,
  purpose: "workflow-drift-detection-only",
  startedAt: new Date().toISOString(),
  finishedAt: undefined,
  status: "running",
  runId,
  runDir,
  cliCommand,
  checks: []
};

try {
  checkKitFiles(checks);
  checkTasksManifest(checks);

  const setup = runCommand(process.execPath, [join(repoRoot, "scripts/human-uat-setup.mjs"), "--output-dir", fixtureRoot], {
    cwd: repoRoot,
    timeoutMs: 60_000
  });
  record("fixture-setup", setup, checks, (result) => {
    if (result.exitCode !== 0) {
      throw new Error(`human-uat-setup failed: ${result.stderr || result.stdout}`);
    }
  });

  const plantedDir = join(fixtureRoot, "planted");
  const decoyDir = join(fixtureRoot, "decoy");
  const unsafeDir = join(fixtureRoot, "unsafe");
  const manifest = JSON.parse(readFileSync(join(fixtureRoot, "manifest.json"), "utf8"));

  const unit = runCommand("npm", ["test"], { cwd: plantedDir, timeoutMs: 30_000 });
  record("planted-unit-test-passes", unit, checks, (result) => {
    if (result.exitCode !== 0) {
      throw new Error("Planted fixture unit test must pass (weak happy path).");
    }
  });

  const probe = runCommand("npm", ["run", "probe:anonymous"], { cwd: plantedDir, timeoutMs: 30_000 });
  record("planted-anonymous-probe-fails", probe, checks, (result) => {
    if (result.exitCode === 0) {
      throw new Error("Planted anonymous probe must fail (expected HTTP != 401).");
    }
  });

  const plantedAnalyzePath = join(runDir, "planted-analyze.json");
  const plantedAnalyze = runCli(
    ["analyze", "--cwd", plantedDir, "--base", manifest.planted.base, "--format", "json", "--output", plantedAnalyzePath],
    checks,
    "planted-analyze"
  );
  const plantedReport = JSON.parse(readFileSync(plantedAnalyzePath, "utf8"));
  assert(plantedAnalyze.exitCode === 0 || plantedAnalyze.exitCode === 1, "analyze should exit 0/1");
  assert(
    Number(plantedReport?.summary?.riskScore ?? 0) > 0 ||
      (Array.isArray(plantedReport?.findings) && plantedReport.findings.length > 0) ||
      (Array.isArray(plantedReport?.changedFiles) && plantedReport.changedFiles.length > 0),
    "planted analyze must surface risk/findings/changed files"
  );
  checks.push({
    id: "UAT-HUMAN-3/4-signal",
    ok: true,
    detail: `planted riskScore=${plantedReport?.summary?.riskScore ?? "n/a"} findings=${plantedReport?.findings?.length ?? 0}`
  });

  const decoyAnalyzePath = join(runDir, "decoy-analyze.json");
  runCli(
    ["analyze", "--cwd", decoyDir, "--base", manifest.decoy.base, "--format", "json", "--output", decoyAnalyzePath],
    checks,
    "decoy-analyze"
  );
  const decoyReport = JSON.parse(readFileSync(decoyAnalyzePath, "utf8"));
  const decoyRisk = String(decoyReport?.summary?.riskLevel ?? decoyReport?.summary?.level ?? "").toLowerCase();
  const decoyScore = Number(decoyReport?.summary?.riskScore ?? 0);
  assert(
    decoyRisk === "low" || decoyScore < Number(plantedReport?.summary?.riskScore ?? 100),
    "clean decoy must stay lower risk than planted defect"
  );
  checks.push({
    id: "UAT-HUMAN-7-decoy",
    ok: true,
    detail: `decoy riskLevel=${decoyRisk || "n/a"} riskScore=${decoyScore}`
  });

  const executePath = join(runDir, "unsafe-execute.json");
  const execute = runCli(
    ["execute", "--cwd", unsafeDir, "--format", "json", "--output", executePath],
    checks,
    "unsafe-execute-blocked"
  );
  const executeReport = JSON.parse(readFileSync(executePath, "utf8"));
  const executeStatus = String(executeReport?.summary?.status ?? "").toLowerCase();
  assert(
    executeStatus === "skipped" || execute.exitCode === 0,
    "unsafe fixture execute must skip when allowCommands is false"
  );
  const skipped =
    Number(executeReport?.summary?.skipped ?? 0) > 0 ||
    (Array.isArray(executeReport?.results) &&
      executeReport.results.some((row) => String(row.status).toLowerCase() === "skipped"));
  assert(skipped, "at least one configured command must be skipped under allowCommands: false");
  checks.push({
    id: "UAT-HUMAN-6-unsafe-block",
    ok: true,
    detail: `execute status=${executeStatus} skipped=${executeReport?.summary?.skipped ?? 0}`
  });

  const aiHelp = runCli(["ai", "--help"], checks, "ai-help-discoverable");
  assert(/preflight|ai/i.test(aiHelp.stdout), "ai workflow help must be discoverable");
  checks.push({ id: "UAT-HUMAN-1-discover", ok: true, detail: "codedecay ai --help ok" });

  checkResultTooling(checks, runDir);

  report.status = "passed";
  report.checks = checks;
  report.finishedAt = new Date().toISOString();
  writeJsonFile(join(runDir, "smoke.json"), report);
  writeJsonFile(join(runDir, "summary.json"), {
    humanEvidence: false,
    status: "passed",
    note: "Deterministic kit/smoke only. Independent human sessions are still required."
  });

  process.stdout.write(
    [
      "Human UAT deterministic smoke passed.",
      `Run: ${runDir}`,
      "humanEvidence: false",
      ""
    ].join("\n")
  );
} catch (error) {
  report.status = "failed";
  report.checks = checks;
  report.error = error instanceof Error ? error.message : String(error);
  report.finishedAt = new Date().toISOString();
  writeJsonFile(join(runDir, "smoke.json"), report);
  console.error(report.error);
  process.exitCode = 1;
}

function checkKitFiles(checks) {
  for (const file of [
    "README.md",
    "participant-script.md",
    "observer-rubric.md",
    "consent-privacy.md",
    "result.schema.json",
    "summary.template.md",
    "facilitator-runbook.md",
    "outreach.md",
    "session-checklist.md",
    "live-session.md",
    "tasks.json",
    "fixtures.md",
    "result-templates/ai-assisted-individual.template.json",
    "result-templates/experienced-engineer.template.json",
    "result-templates/team-devops.template.json"
  ]) {
    const path = join(kitRoot, file);
    assert(existsSync(path), `missing kit file: ${file}`);
  }
  checks.push({ id: "kit-files", ok: true, detail: "versioned kit files present" });
}

function checkResultTooling(checks, runDir) {
  const sampleDir = join(repoRoot, "scripts/fixtures/human-uat/sample-results");
  const samples = [
    "ai-assisted-individual.synthetic.json",
    "experienced-engineer.synthetic.json",
    "team-devops.synthetic.json"
  ].map((name) => join(sampleDir, name));
  for (const sample of samples) {
    assert(existsSync(sample), `missing synthetic sample ${sample}`);
    const sampleJson = JSON.parse(readFileSync(sample, "utf8"));
    assert(
      /SYNTHETIC FIXTURE/i.test(String(sampleJson.observerNotes ?? "")),
      "synthetic samples must be labeled as non-human evidence"
    );
  }

  const template = join(kitRoot, "result-templates/ai-assisted-individual.template.json");
  const templateValidate = runCommand(
    process.execPath,
    [join(repoRoot, "scripts/human-uat-validate-result.mjs"), template],
    { cwd: repoRoot, timeoutMs: 15_000 }
  );
  record("template-rejects-until-filled", templateValidate, checks, (result) => {
    if (result.exitCode === 0) {
      throw new Error("Blank result templates must fail validation until humanEvidence=true and fields are filled.");
    }
  });

  const validate = runCommand(
    process.execPath,
    [join(repoRoot, "scripts/human-uat-validate-result.mjs"), ...samples],
    { cwd: repoRoot, timeoutMs: 15_000 }
  );
  record("synthetic-results-validate", validate, checks, (result) => {
    if (result.exitCode !== 0) {
      throw new Error(`synthetic sample validation failed: ${result.stderr || result.stdout}`);
    }
  });

  const summaryMd = join(runDir, "synthetic-summary.md");
  const summarize = runCommand(
    process.execPath,
    [join(repoRoot, "scripts/human-uat-summarize.mjs"), "--out", summaryMd, ...samples],
    { cwd: repoRoot, timeoutMs: 15_000 }
  );
  record("synthetic-summarize", summarize, checks, (result) => {
    if (result.exitCode !== 0) {
      throw new Error(`summarize failed: ${result.stderr || result.stdout}`);
    }
    const markdown = readFileSync(summaryMd, "utf8");
    assert(/Decision: pass/i.test(markdown), "synthetic three-role summary should decide pass");
    assert(/not deterministic smoke output/i.test(markdown), "summary must distinguish from smoke");
  });
  checks.push({
    id: "result-tooling",
    ok: true,
    detail: "templates reject; synthetic samples validate+summarize (not human evidence)"
  });
}

function checkTasksManifest(checks) {
  const tasks = JSON.parse(readFileSync(join(kitRoot, "tasks.json"), "utf8"));
  assert(tasks.schemaVersion === 1, "tasks.json schemaVersion must be 1");
  assert(tasks.humanEvidence === false, "tasks.json must set humanEvidence:false");
  const ids = (tasks.tasks ?? []).map((task) => task.id);
  for (const id of HUMAN_UAT_TASK_IDS) {
    assert(ids.includes(id), `tasks.json missing ${id}`);
  }
  checks.push({ id: "tasks-manifest", ok: true, detail: `tasks=${ids.length}` });
}

function runCli(args, checks, id) {
  const result = runCommand(cliCommand[0], [...cliCommand.slice(1), ...args], {
    cwd: repoRoot,
    timeoutMs: 120_000
  });
  record(id, result, checks, () => {
    /* callers assert semantics */
  });
  return result;
}

function record(id, result, checks, assertFn) {
  const entry = {
    id,
    ok: result.exitCode === 0 || result.exitCode === 1,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  };
  try {
    assertFn(result);
    entry.ok = true;
  } catch (error) {
    entry.ok = false;
    entry.error = error instanceof Error ? error.message : String(error);
    checks.push(entry);
    throw error;
  }
  checks.push(entry);
}

function assertBuiltCli() {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  if (!options.cli && !existsSync(cliPath)) {
    throw new Error("Built CLI missing. Run pnpm build:packages first.");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const parsed = { runId: undefined, outputDir: undefined, cli: undefined, help: false };
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = readOptionValue(normalized, ++index, arg);
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = readOptionValue(normalized, ++index, arg);
      continue;
    }
    if (arg === "--cli") {
      parsed.cli = readOptionValue(normalized, ++index, arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/human-uat-smoke.mjs [options]",
      "",
      "Deterministic CI smoke for human-UAT kit/fixtures drift.",
      "Does not count as independent human acceptance evidence.",
      "",
      "Options:",
      "  --run-id <id>",
      "  --output-dir <path>",
      "  --cli <command>",
      "  --help",
      ""
    ].join("\n")
  );
}
