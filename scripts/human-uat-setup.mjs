#!/usr/bin/env node
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readOptionValue } from "./lib/args.mjs";
import { resetDir, writeFiles, writeJsonFile } from "./lib/files.mjs";
import { initFixtureGitRepo, runGit, runGitOutput } from "./lib/git.mjs";
import {
  decoyBaselineFiles,
  decoyChangedFiles,
  plantedBaselineFiles,
  plantedRiskyFiles,
  unsafeTargetFiles
} from "./fixtures/human-uat/repos.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const allowedOutputRoot = resolve(repoRoot, ".codedecay/local/human-uat");
const outputRoot = resolve(repoRoot, options.outputDir ?? ".codedecay/local/human-uat/fixtures");
assertSafeOutputDir(outputRoot);

const plantedDir = resolve(outputRoot, "planted");
const decoyDir = resolve(outputRoot, "decoy");
const unsafeDir = resolve(outputRoot, "unsafe");

const planted = materializePlanted(plantedDir);
const decoy = materializeDecoy(decoyDir);
const unsafe = materializeUnsafe(unsafeDir);

const manifest = {
  schemaVersion: 1,
  purpose: "human-uat-fixture-materialization",
  humanEvidence: false,
  outputRoot,
  planted,
  decoy,
  unsafe
};

writeJsonFile(resolve(outputRoot, "manifest.json"), manifest);

process.stdout.write(
  [
    "Human UAT fixtures ready (not human evidence).",
    `Planted: ${plantedDir}`,
    `  base=${planted.base} head=${planted.head}`,
    `Decoy:   ${decoyDir}`,
    `  base=${decoy.base} head=${decoy.head}`,
    `Unsafe:  ${unsafeDir}`,
    `  head=${unsafe.head}`,
    ""
  ].join("\n")
);

function materializePlanted(dir) {
  resetDir(dir);
  writeFiles(dir, plantedBaselineFiles());
  const base = initFixtureGitRepo(dir, {
    userName: "CodeDecay Human UAT",
    commitMessage: "baseline: protect invoice API"
  });
  writeFiles(dir, plantedRiskyFiles());
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "feat: keep invoice lookup available without auth"]);
  const head = runGitOutput(dir, ["rev-parse", "HEAD"]).trim();
  return { dir, base, head, kind: "planted-defect" };
}

function materializeDecoy(dir) {
  resetDir(dir);
  writeFiles(dir, decoyBaselineFiles());
  const base = initFixtureGitRepo(dir, {
    userName: "CodeDecay Human UAT",
    commitMessage: "baseline: docs decoy"
  });
  writeFiles(dir, decoyChangedFiles());
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "docs: clarify README"]);
  const head = runGitOutput(dir, ["rev-parse", "HEAD"]).trim();
  return { dir, base, head, kind: "clean-decoy" };
}

function materializeUnsafe(dir) {
  resetDir(dir);
  writeFiles(dir, unsafeTargetFiles());
  const head = initFixtureGitRepo(dir, {
    userName: "CodeDecay Human UAT",
    commitMessage: "baseline: unsafe target with allowCommands false"
  });
  return { dir, base: head, head, kind: "unsafe-blocked" };
}

function parseArgs(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const parsed = { outputDir: undefined, help: false };
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
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

function assertSafeOutputDir(candidate) {
  const relativePath = relative(allowedOutputRoot, candidate);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("The fixture output must be a child of .codedecay/local/human-uat/.");
  }
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/human-uat-setup.mjs [options]",
      "",
      "Materialize planted, clean-decoy, and unsafe-target fixtures for human UAT.",
      "This is kit scaffolding only — not independent human acceptance evidence.",
      "",
      "Options:",
      "  --output-dir <path>  Destination under .codedecay/local/human-uat/",
      "  --help               Show this help",
      ""
    ].join("\n")
  );
}
