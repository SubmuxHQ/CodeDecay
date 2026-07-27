import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeJsProject } from "../packages/analyzer-js/dist/index.js";
import { createAnalysisReport } from "../packages/core/dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = join(
  repositoryRoot,
  "judge-lab",
  "public",
  "evidence",
  "weak-test-report.json",
);
const checkOnly = process.argv.includes("--check");
const sourcePath = "src/imu/normalize.ts";
const testPath = "src/imu/normalize.test.ts";
const source = [
  "export function normalizeUserId(value: string) {",
  "  const normalized = value.trim().toLowerCase();",
  "  const bounded = normalized.slice(0, 8);",
  "  return bounded.replace(/[^a-z]/g, '');",
  "}",
  "",
].join("\n");
const weakTest = [
  "import { normalizeUserId } from './normalize';",
  "vi.mock('./normalize', () => ({ normalizeUserId: vi.fn(() => 'sensor') }));",
  "function copiedNormalize(value: string) {",
  "  const normalized = value.trim().toLowerCase();",
  "  const bounded = normalized.slice(0, 8);",
  "  return bounded.replace(/[^a-z]/g, '');",
  "}",
  "test('normalizes imu id', () => {",
  "  expect(normalizeUserId(' SENSOR-123 ')).toBe(copiedNormalize(' SENSOR-123 '));",
  "});",
  "",
].join("\n");

const fixtureRoot = await mkdtemp(join(tmpdir(), "codedecay-judge-lab-"));
try {
  await writeFixture(sourcePath, source);
  await writeFixture(testPath, weakTest);

  const changedFiles = [change(sourcePath, source), change(testPath, weakTest)];
  const analyzerResult = analyzeJsProject({
    rootDir: fixtureRoot,
    changedFiles,
  });
  const report = createAnalysisReport({
    base: "base",
    head: "risky",
    changedFiles,
    analyzerResult,
    generatedAt: "2026-07-27T00:00:00.000Z",
  });
  const weakRuleIds = new Set([
    "mocked-changed-source",
    "copied-implementation-in-test",
  ]);
  const weakFindings = report.findings.filter((finding) =>
    weakRuleIds.has(finding.ruleId),
  );
  assert.deepEqual(
    new Set(weakFindings.map((finding) => finding.ruleId)),
    weakRuleIds,
    "The release-candidate analyzer must reproduce both curated weak-test findings.",
  );

  const artifact = {
    schemaVersion: 1,
    generator: "scripts/generate-judge-lab-evidence.mjs",
    engineVersion: report.version,
    generatedAt: report.generatedAt,
    scenarioId: "weak-test",
    findings: weakFindings.map((finding) => ({
      ruleId: finding.ruleId,
      title: finding.title,
      detail: finding.description,
      severity: finding.severity,
      evidenceKind: "deterministic",
      file: finding.file,
      line: finding.line,
    })),
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

  if (checkOnly) {
    assert.equal(
      await readFile(artifactPath, "utf8"),
      serialized,
      "Judge Lab evidence is stale. Run: pnpm judge-lab:evidence",
    );
  } else {
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, serialized, "utf8");
    console.log(`Wrote ${artifactPath}`);
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

async function writeFixture(path, content) {
  const target = join(fixtureRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function change(path, content) {
  return {
    path,
    status: "modified",
    additions: content.split("\n").length,
    deletions: 1,
    addedLines: content
      .split("\n")
      .map((line, index) => ({ line: index + 1, content: line })),
  };
}
