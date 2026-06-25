import type { CodeDecayReport, FileChange, Finding } from "@submuxhq/codedecay-core";
import { dedupeStrings, sortFindings } from "@submuxhq/codedecay-core";

export type TestProofStatus = "missing" | "weak" | "present" | "not_applicable";

export interface TestProofAudit {
  status: TestProofStatus;
  summary: string;
  changedSourceFiles: string[];
  changedTestFiles: string[];
  missingTestFindings: Finding[];
  weakTestFindings: Finding[];
  recommendedChecks: string[];
}

const TEST_DIR_NAMES = new Set(["test", "tests", "spec", "specs", "e2e", "integration", "__tests__", "__specs__"]);
const TEST_FILE_STEM_PATTERN = /(^|[._-])(test|spec|e2e|integration)([._-]|$)/i;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const MISSING_TEST_RULES = new Set(["missing-nearby-tests"]);
const WEAK_TEST_RULES = new Set([
  "test-without-assertions",
  "snapshot-only-test",
  "mocked-changed-source",
  "unrelated-test-change",
  "copied-implementation-in-test",
  "happy-path-only-test",
  "heavy-mocking",
  "test-bloat"
]);

export function createTestProofAudit(report: CodeDecayReport): TestProofAudit {
  const changedSourceFiles = report.changedFiles
    .filter((change) => isChangedSourceFile(change))
    .map((change) => change.path)
    .sort((left, right) => left.localeCompare(right));
  const changedTestFiles = report.changedFiles
    .filter((change) => change.status !== "deleted" && isTestPath(change.path))
    .map((change) => change.path)
    .sort((left, right) => left.localeCompare(right));
  const missingTestFindings = sortFindings(report.findings.filter((finding) => MISSING_TEST_RULES.has(finding.ruleId)));
  const weakTestFindings = sortFindings(report.findings.filter((finding) => WEAK_TEST_RULES.has(finding.ruleId)));
  const status = classifyTestProof({
    changedSourceFiles,
    changedTestFiles,
    missingTestFindings,
    weakTestFindings
  });

  return {
    status,
    summary: summarizeStatus(status),
    changedSourceFiles,
    changedTestFiles,
    missingTestFindings,
    weakTestFindings,
    recommendedChecks: recommendStrongerChecks({
      report,
      status,
      changedSourceFiles,
      changedTestFiles,
      missingTestFindings,
      weakTestFindings
    })
  };
}

export function weakTestRuleIds(): string[] {
  return [...WEAK_TEST_RULES].sort((left, right) => left.localeCompare(right));
}

export function missingTestRuleIds(): string[] {
  return [...MISSING_TEST_RULES].sort((left, right) => left.localeCompare(right));
}

function classifyTestProof(input: {
  changedSourceFiles: string[];
  changedTestFiles: string[];
  missingTestFindings: Finding[];
  weakTestFindings: Finding[];
}): TestProofStatus {
  if (input.changedSourceFiles.length === 0 && input.changedTestFiles.length === 0) {
    return "not_applicable";
  }

  if (input.missingTestFindings.length > 0 || (input.changedSourceFiles.length > 0 && input.changedTestFiles.length === 0)) {
    return "missing";
  }

  if (input.weakTestFindings.length > 0) {
    return "weak";
  }

  return "present";
}

function summarizeStatus(status: TestProofStatus): string {
  if (status === "missing") {
    return "Changed source behavior does not have nearby changed test proof.";
  }

  if (status === "weak") {
    return "Changed tests exist, but deterministic rules found weak proof signals.";
  }

  if (status === "present") {
    return "Changed tests are present and no deterministic weak-test signals were found.";
  }

  return "No changed source or test files require a test proof audit.";
}

function recommendStrongerChecks(input: {
  report: CodeDecayReport;
  status: TestProofStatus;
  changedSourceFiles: string[];
  changedTestFiles: string[];
  missingTestFindings: Finding[];
  weakTestFindings: Finding[];
}): string[] {
  const checks: string[] = [];

  if (input.status === "missing") {
    for (const file of input.changedSourceFiles.slice(0, 8)) {
      checks.push(`Add or run tests that exercise ${file} through its public behavior path.`);
    }
  }

  for (const finding of [...input.missingTestFindings, ...input.weakTestFindings]) {
    checks.push(strongerCheckForFinding(finding));
  }

  checks.push(...input.report.recommendedTests.filter(isTestProofRecommendation).map(normalizeRecommendedCheck));

  if (input.status === "weak" && input.changedTestFiles.length > 0) {
    for (const file of input.changedTestFiles.slice(0, 4)) {
      checks.push(`Strengthen ${file} with assertions, negative cases, and real-boundary coverage.`);
    }
  }

  return dedupeStrings(checks);
}

function strongerCheckForFinding(finding: Finding): string {
  if (finding.ruleId === "test-without-assertions") {
    return `Add meaningful assertions to ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "snapshot-only-test") {
    return `Add explicit behavior assertions alongside snapshots in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "mocked-changed-source") {
    return `Exercise the changed module through a real boundary instead of mocking it in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "copied-implementation-in-test") {
    return `Replace copied implementation assertions with externally visible behavior checks in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "happy-path-only-test") {
    return `Add negative, malformed, missing, or boundary-value cases in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "heavy-mocking") {
    return `Reduce mock-only confidence by adding a real-module or integration check for ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "test-bloat") {
    return `Confirm large test changes in ${finding.file ?? "the changed test"} prove behavior and are not only fixture or mock expansion.`;
  }

  return finding.description;
}

function isChangedSourceFile(change: FileChange): boolean {
  return change.status !== "deleted" && isSourcePath(change.path) && !isTestPath(change.path) && !isDocsPath(change.path);
}

function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extensionOf(path));
}

function isTestPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const directorySegments = segments.slice(0, -1);
  if (directorySegments.some((segment) => TEST_DIR_NAMES.has(segment))) {
    return true;
  }

  const fileName = segments.at(-1) ?? normalized;
  return TEST_FILE_STEM_PATTERN.test(stripExtension(fileName));
}

function isDocsPath(path: string): boolean {
  return /(^|\/)(docs?|readme|changelog|license)(\/|\.|$)/i.test(path) || /\.(md|mdx|txt)$/i.test(path);
}

function extensionOf(path: string): string {
  const match = /\.[^.\/]+$/.exec(path);
  return match?.[0].toLowerCase() ?? "";
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}

function isTestProofRecommendation(value: string): boolean {
  return /assertion|snapshot|integration|real-module|public API|negative|edge-case|exercise|test|spec|e2e/i.test(value);
}

function normalizeRecommendedCheck(value: string): string {
  const trimmed = value.trim();
  if (isPathLikeRecommendation(trimmed)) {
    return `Run or strengthen ${trimmed} with assertions, negative cases, and real-boundary coverage.`;
  }

  return trimmed;
}

function isPathLikeRecommendation(value: string): boolean {
  const hasNoWhitespace = value.split(/\s+/).length === 1;
  const hasDirectorySeparator = value.includes("/") || value.includes("\\");
  const hasFileExtension = /\.[a-z0-9]+$/i.test(value);
  const hasOnlyPathCharacters = /^[a-z0-9._/-]+$/i.test(value);

  return hasNoWhitespace && hasDirectorySeparator && hasFileExtension && hasOnlyPathCharacters;
}
