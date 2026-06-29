import type { FileChange, Finding } from "@submuxhq/codedecay-core";
import { classifyPath } from "../../classifiers/paths";
import { firstLine } from "../../findings/builders";
import type { CopiedImplementationBlock } from "../copied-implementation";
import type { SourceProfile } from "../source-profiles";
import { referencesSourceProfile } from "../source-profiles";
import { SNAPSHOT_ASSERTION_PATTERN, hasNegativeOrEdgeCaseSignal, looksLikeRunnableTest } from "../weak-patterns";
import type { WeakTestContext } from "./types";

export function addAssertionFindings(
  testChange: FileChange,
  context: WeakTestContext,
  findings: Finding[],
  recommendedTests: string[]
): void {
  if (looksLikeRunnableTest(context.content) && context.assertionLines.length === 0) {
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

  if (
    context.snapshotLines.length > 0 &&
    context.assertionLines.every((line) => SNAPSHOT_ASSERTION_PATTERN.test(line.content))
  ) {
    findings.push({
      ruleId: "snapshot-only-test",
      title: "Snapshot-only changed test",
      description: `${testChange.path} appears to rely only on snapshot assertions, which can miss behavior regressions.`,
      severity: "medium",
      category: "coverage",
      file: testChange.path,
      line: context.snapshotLines[0]?.line
    });
    recommendedTests.push(`Add explicit behavior assertions to ${testChange.path}`);
  }
}

export function addMockedSourceFindings(
  testChange: FileChange,
  context: WeakTestContext,
  sourceProfiles: SourceProfile[],
  findings: Finding[],
  recommendedTests: string[]
): void {
  const mockedSources = sourceProfiles.filter((profile) =>
    referencesSourceProfile(context.mockLines.map((line) => line.content).join("\n"), profile)
  );
  if (mockedSources.length === 0) {
    return;
  }

  findings.push({
    ruleId: "mocked-changed-source",
    title: "Changed test mocks changed source",
    description: `${testChange.path} mocks changed source code instead of exercising the real behavior path.`,
    severity: "high",
    category: "coverage",
    file: testChange.path,
    line: context.mockLines[0]?.line
  });
  for (const source of mockedSources.slice(0, 3)) {
    recommendedTests.push(`Add an integration or real-module check for ${source.path}`);
  }
}

export function addUnrelatedTestFinding(
  testChange: FileChange,
  changedSourceFiles: FileChange[],
  findings: Finding[],
  recommendedTests: string[]
): void {
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

export function addCopiedImplementationFinding(
  testChange: FileChange,
  copiedBlock: CopiedImplementationBlock,
  findings: Finding[],
  recommendedTests: string[]
): void {
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

export function addHappyPathOnlyFinding(
  testChange: FileChange,
  context: WeakTestContext,
  changedSourceFiles: FileChange[],
  findings: Finding[],
  recommendedTests: string[]
): void {
  if (context.assertionLines.length === 0 || !changedSourceFiles.some((change) => classifyPath(change.path)?.risk !== "low")) {
    return;
  }

  if (!hasNegativeOrEdgeCaseSignal(context.content)) {
    findings.push({
      ruleId: "happy-path-only-test",
      title: "Changed test looks happy-path only",
      description: `${testChange.path} has assertions but no obvious negative, malformed, or boundary case coverage for risky source changes.`,
      severity: "medium",
      category: "coverage",
      file: testChange.path,
      line: context.assertionLines[0]?.line
    });
    recommendedTests.push(`Add negative and edge-case coverage for ${changedSourceFiles[0]?.path ?? "the risky source change"}`);
  }
}
