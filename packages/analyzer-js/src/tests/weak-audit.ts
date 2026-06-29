import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ChangedLine, FileChange, Finding } from "@submuxhq/codedecay-core";
import { classifyPath } from "../classifiers/paths";
import { normalizeImplementationLine } from "../code/normalize";
import { firstLine } from "../findings/builders";

export interface TestAuditResult {
  findings: Finding[];
  recommendedTests: string[];
}

interface SourceProfile {
  path: string;
  dirname: string;
  basename: string;
  stem: string;
  importPath: string;
}

interface SourceLogicBlock {
  sourcePath: string;
  key: string;
}

interface CopiedImplementationBlock {
  sourcePath: string;
  testLine: number;
}

const ASSERTION_PATTERN =
  /\b(expect|assert|strictEqual|deepStrictEqual|ok)\s*\(|\bshould\(|\bto(Be|Equal|StrictEqual|Contain|Match|Have|Throw|BeTruthy|BeFalsy)\b/;
const SNAPSHOT_ASSERTION_PATTERN = /\b(toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot)\s*\(/;
const MOCK_PATTERN =
  /\b(jest\.mock|vi\.mock|sinon\.stub|sinon\.mock|mockResolvedValue|mockRejectedValue|mockReturnValue|mockImplementation|createMock|mockFn)\b/;
const TEST_CASE_PATTERN = /\b(it|test|specify)\s*\(/;
const GENERIC_SOURCE_STEMS = new Set(["index", "main", "app", "page", "route", "layout", "config"]);

export function detectWeakTests(rootDir: string, changedTestFiles: FileChange[], changedSourceFiles: FileChange[]): TestAuditResult {
  const findings: Finding[] = [];
  const recommendedTests: string[] = [];

  if (changedTestFiles.length === 0) {
    return { findings, recommendedTests };
  }

  const sourceProfiles = changedSourceFiles.map((change) => createSourceProfile(change));
  const sourceBlocks = createSourceLogicBlocks(changedSourceFiles);

  for (const testChange of changedTestFiles) {
    const content = readChangedFile(rootDir, testChange.path) ?? testChange.addedLines.map((line) => line.content).join("\n");
    const lines = content.split(/\r?\n/);
    const assertionLines = findLineMatches(lines, ASSERTION_PATTERN);
    const snapshotLines = findLineMatches(lines, SNAPSHOT_ASSERTION_PATTERN);
    const mockLines = findLineMatches(lines, MOCK_PATTERN);

    if (looksLikeRunnableTest(content) && assertionLines.length === 0) {
      findings.push({
        ruleId: "test-without-assertions",
        title: "Changed test has no assertions",
        description: `${testChange.path} defines test cases but does not appear to assert behavior.`,
        severity: "medium",
        category: "coverage",
        file: testChange.path,
        line: firstLine(testChange) ?? 1
      });
      recommendedTests.push(`Add real assertions to ${testChange.path}`);
    }

    if (snapshotLines.length > 0 && assertionLines.every((line) => SNAPSHOT_ASSERTION_PATTERN.test(line.content))) {
      findings.push({
        ruleId: "snapshot-only-test",
        title: "Snapshot-only changed test",
        description: `${testChange.path} appears to rely only on snapshot assertions, which can miss behavior regressions.`,
        severity: "medium",
        category: "coverage",
        file: testChange.path,
        line: snapshotLines[0]?.line
      });
      recommendedTests.push(`Add explicit behavior assertions to ${testChange.path}`);
    }

    const mockedSources = sourceProfiles.filter((profile) => referencesSourceProfile(mockLines.map((line) => line.content).join("\n"), profile));
    if (mockedSources.length > 0) {
      findings.push({
        ruleId: "mocked-changed-source",
        title: "Changed test mocks changed source",
        description: `${testChange.path} mocks changed source code instead of exercising the real behavior path.`,
        severity: "high",
        category: "coverage",
        file: testChange.path,
        line: mockLines[0]?.line
      });
      for (const source of mockedSources.slice(0, 3)) {
        recommendedTests.push(`Add an integration or real-module check for ${source.path}`);
      }
    }

    if (changedSourceFiles.length > 0 && !referencesAnyChangedSource(testChange, content, sourceProfiles)) {
      findings.push({
        ruleId: "unrelated-test-change",
        title: "Changed test does not reference changed source",
        description: `${testChange.path} changed, but it does not appear to exercise any changed source file.`,
        severity: "medium",
        category: "coverage",
        file: testChange.path,
        line: firstLine(testChange) ?? 1
      });
      recommendedTests.push(`Add or update tests that exercise ${changedSourceFiles[0]?.path ?? "the changed source"}`);
    }

    const copiedBlock = findCopiedImplementationBlock(lines, sourceBlocks);
    if (copiedBlock) {
      findings.push({
        ruleId: "copied-implementation-in-test",
        title: "Test appears to copy implementation logic",
        description: `${testChange.path} includes logic copied from ${copiedBlock.sourcePath}; this can make tests pass without protecting real behavior.`,
        severity: "high",
        category: "coverage",
        file: testChange.path,
        line: copiedBlock.testLine
      });
      recommendedTests.push(`Exercise ${copiedBlock.sourcePath} through its public API instead of copying its logic`);
    }

    if (assertionLines.length > 0 && changedSourceFiles.some((change) => classifyPath(change.path)?.risk !== "low")) {
      const contentLower = content.toLowerCase();
      const hasNegativeOrEdgeCase = /(invalid|missing|null|undefined|empty|error|fail|reject|unauthorized|forbidden|boundary|overflow|malformed)/.test(contentLower);
      if (!hasNegativeOrEdgeCase) {
        findings.push({
          ruleId: "happy-path-only-test",
          title: "Changed test looks happy-path only",
          description: `${testChange.path} has assertions but no obvious negative, malformed, or boundary case coverage for risky source changes.`,
          severity: "medium",
          category: "coverage",
          file: testChange.path,
          line: assertionLines[0]?.line
        });
        recommendedTests.push(`Add negative and edge-case coverage for ${changedSourceFiles[0]?.path ?? "the risky source change"}`);
      }
    }
  }

  return {
    findings,
    recommendedTests
  };
}

function createSourceProfile(change: FileChange): SourceProfile {
  const stem = stripExtension(basename(change.path));
  return {
    path: change.path,
    dirname: dirname(change.path),
    basename: basename(change.path),
    stem,
    importPath: stripExtension(change.path)
  };
}

function referencesAnyChangedSource(
  testChange: FileChange,
  content: string,
  sourceProfiles: SourceProfile[]
): boolean {
  return sourceProfiles.some((profile) => isNearbyTestForSource(testChange.path, profile) || referencesSourceProfile(content, profile));
}

function referencesSourceProfile(content: string, profile: SourceProfile): boolean {
  const normalized = content.replaceAll("\\", "/");
  const importPathWithoutSrc = profile.importPath.replace(/^src\//, "");
  const hasMeaningfulStem = !GENERIC_SOURCE_STEMS.has(profile.stem.toLowerCase());

  return (
    normalized.includes(profile.path) ||
    normalized.includes(profile.importPath) ||
    normalized.includes(importPathWithoutSrc) ||
    normalized.includes(profile.basename) ||
    (hasMeaningfulStem && new RegExp(`\\b${escapeRegExp(profile.stem)}\\b`, "i").test(normalized))
  );
}

function isNearbyTestForSource(testPath: string, profile: SourceProfile): boolean {
  const testDir = dirname(testPath);
  const testStem = stripExtension(basename(testPath))
    .replace(/(\.|-|_)test$/i, "")
    .replace(/(\.|-|_)spec$/i, "");

  return (
    testStem.includes(profile.stem) ||
    profile.stem.includes(testStem) ||
    testDir.startsWith(profile.dirname) ||
    profile.dirname.startsWith(testDir)
  );
}

function createSourceLogicBlocks(changedSourceFiles: FileChange[]): SourceLogicBlock[] {
  const blocks: SourceLogicBlock[] = [];

  for (const change of changedSourceFiles) {
    const normalizedLines = change.addedLines
      .map((line) => normalizeImplementationLine(line.content))
      .filter((line) => line.length >= 8);

    for (let index = 0; index <= normalizedLines.length - 3; index += 1) {
      const key = normalizedLines.slice(index, index + 3).join("\n");
      blocks.push({
        sourcePath: change.path,
        key
      });
    }
  }

  return blocks;
}

function findCopiedImplementationBlock(
  testLines: string[],
  sourceBlocks: SourceLogicBlock[]
): CopiedImplementationBlock | undefined {
  if (sourceBlocks.length === 0) {
    return undefined;
  }

  const normalizedTestLines = testLines
    .map((content, index) => ({
      line: index + 1,
      content: normalizeImplementationLine(content)
    }))
    .filter((line) => line.content.length >= 8);

  for (let index = 0; index <= normalizedTestLines.length - 3; index += 1) {
    const blockLines = normalizedTestLines.slice(index, index + 3);
    const key = blockLines.map((line) => line.content).join("\n");
    const match = sourceBlocks.find((sourceBlock) => sourceBlock.key === key);
    if (match) {
      return {
        sourcePath: match.sourcePath,
        testLine: blockLines[0]?.line ?? 1
      };
    }
  }

  return undefined;
}

function findLineMatches(lines: string[], pattern: RegExp): ChangedLine[] {
  return lines.flatMap((content, index) => (pattern.test(content) ? [{ line: index + 1, content }] : []));
}

function looksLikeRunnableTest(content: string): boolean {
  return TEST_CASE_PATTERN.test(content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readChangedFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}
