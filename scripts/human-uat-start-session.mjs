#!/usr/bin/env node
/**
 * One-command facilitator prep for independent human UAT sessions.
 * Does not invent participant outcomes or count as human evidence.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunId, readOptionValue } from "./lib/args.mjs";
import { resetDir, writeJsonFile } from "./lib/files.mjs";
import { runCommand } from "./lib/process.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const runId = options.runId ?? createRunId();
const sessionRoot = resolve(
  repoRoot,
  options.outputDir ?? `.codedecay/local/human-uat/session/${runId}`
);
const packDir = join(sessionRoot, "pack");
const consumerDir = join(sessionRoot, "consumer");
const fixturesDir = join(sessionRoot, "fixtures");
const resultsDir = join(sessionRoot, "results");
const logsDir = join(sessionRoot, "logs");

assertBuiltCli();
resetDir(sessionRoot);
mkdirSync(packDir, { recursive: true });
mkdirSync(consumerDir, { recursive: true });
mkdirSync(resultsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

const setup = runCommand(
  process.execPath,
  [join(repoRoot, "scripts/human-uat-setup.mjs"), "--output-dir", fixturesDir],
  { cwd: repoRoot, timeoutMs: 60_000 }
);
failIf(setup, "fixture setup failed");

const pack = runCommand("npm", ["pack", join(repoRoot, "packages/cli"), "--pack-destination", packDir], {
  cwd: repoRoot,
  timeoutMs: 120_000
});
failIf(pack, "npm pack failed");
const tarballName = (pack.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "").trim();
const tarballPath = join(packDir, tarballName);
if (!existsSync(tarballPath)) {
  throw new Error(`Expected packed tarball at ${tarballPath}`);
}

writeFileSync(
  join(consumerDir, "package.json"),
  `${JSON.stringify({ name: "codedecay-human-uat-consumer", private: true }, null, 2)}\n`
);
const install = runCommand("npm", ["install", tarballPath], {
  cwd: consumerDir,
  timeoutMs: 120_000
});
failIf(install, "fresh consumer install failed");

const codedecayBin = join(consumerDir, "node_modules/.bin/codedecay");
const version = runCommand(codedecayBin, ["--version"], { cwd: consumerDir, timeoutMs: 15_000 });
failIf(version, "codedecay --version failed");

for (const role of ["ai-assisted-individual", "experienced-engineer", "team-devops"]) {
  const template = join(
    repoRoot,
    "docs/evals/uat-kit/result-templates",
    `${role}.template.json`
  );
  cpSync(template, join(resultsDir, `${role}.pending.json`));
}

const readiness = {
  schemaVersion: 1,
  humanEvidence: false,
  purpose: "facilitator-session-readiness",
  runId,
  sessionRoot,
  packageIdentity: {
    source: "packed-tarball",
    version: version.stdout.trim(),
    tarball: tarballName
  },
  paths: {
    fixtures: fixturesDir,
    consumer: consumerDir,
    codedecayBin,
    results: resultsDir,
    logs: logsDir,
    kit: join(repoRoot, "docs/evals/uat-kit")
  },
  nextSteps: [
    "Send docs/evals/uat-kit/outreach.md to three independent participants.",
    "Review consent-privacy.md with each participant.",
    "Run session-checklist.md; participants use codedecayBin against fixtures.",
    "Fill results/*.pending.json, set humanEvidence=true, validate, then summarize."
  ]
};
writeJsonFile(join(sessionRoot, "readiness.json"), readiness);
writeFileSync(
  join(sessionRoot, "README.md"),
  [
    "# Human UAT session workspace",
    "",
    `Run id: \`${runId}\``,
    `Package: packed tarball @ \`${version.stdout.trim()}\``,
    "",
    "This workspace is facilitator prep only. It is **not** independent human evidence.",
    "",
    "## Paths",
    "",
    `- Fixtures: \`${fixturesDir}\``,
    `- Fresh consumer + binary: \`${codedecayBin}\``,
    `- Pending results: \`${resultsDir}\``,
    `- Kit: \`docs/evals/uat-kit/\``,
    "",
    "## Start a participant",
    "",
    "1. Consent: `docs/evals/uat-kit/consent-privacy.md`",
    "2. Script: `docs/evals/uat-kit/participant-script.md`",
    "3. Use the packed binary above (not a workspace import).",
    "4. Fill one `results/<role>.pending.json` and set `humanEvidence: true`.",
    "5. `node scripts/human-uat-validate-result.mjs <result.json>`",
    ""
  ].join("\n")
);

process.stdout.write(
  [
    "Human UAT session workspace ready (not human evidence).",
    `Session: ${sessionRoot}`,
    `codedecay: ${codedecayBin} (${version.stdout.trim()})`,
    `tarball: ${tarballName}`,
    "Next: recruit 3 independent participants with docs/evals/uat-kit/outreach.md",
    ""
  ].join("\n")
);

function assertBuiltCli() {
  if (!existsSync(join(repoRoot, "packages/cli/dist/index.js"))) {
    throw new Error("Built CLI missing. Run pnpm build:packages first.");
  }
}

function failIf(result, message) {
  if (result.exitCode !== 0) {
    throw new Error(`${message}: ${result.stderr || result.stdout}`);
  }
}

function parseArgs(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const parsed = { runId: undefined, outputDir: undefined, help: false };
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
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/human-uat-start-session.mjs [options]",
      "",
      "Prepare fixtures, packed tarball consumer install, and pending result files.",
      "Does not count as independent human acceptance evidence.",
      "",
      "Options:",
      "  --run-id <id>",
      "  --output-dir <path>  under .codedecay/local/human-uat/ preferred",
      "  --help",
      ""
    ].join("\n")
  );
}
