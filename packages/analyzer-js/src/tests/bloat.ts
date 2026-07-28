import type { FileChange, Finding } from "@submuxhq/codedecay-core";
import { isTestPath } from "../classifiers/paths";
import { firstLine } from "../findings/builders";
import { MOCK_PATTERN, SNAPSHOT_ASSERTION_PATTERN } from "./weak-patterns";
const MIN_TEST_ADDITIONS = 60;
const TEST_TO_SOURCE_RATIO_THRESHOLD = 2;
const MOCK_OR_SNAPSHOT_LINE_THRESHOLD = 12;
const HIGH_TEST_ADDITIONS = 180;
const HIGH_TEST_TO_SOURCE_RATIO = 4;
const HIGH_MOCK_OR_SNAPSHOT_LINES = 20;

export function detectTestBloat(changedFiles: FileChange[], changedSourceFiles: FileChange[]): Finding[] {
  const sourceAdditions = changedSourceFiles.reduce((sum, file) => sum + file.additions, 0);
  const findings: Finding[] = [];

  for (const change of changedFiles.filter((file) => isTestPath(file.path))) {
    const mockLines = change.addedLines.filter(
      (line) => MOCK_PATTERN.test(line.content) || SNAPSHOT_ASSERTION_PATTERN.test(line.content)
    );
    const testToSourceRatio = sourceAdditions > 0 ? change.additions / sourceAdditions : 0;
    const hasDisproportionateGrowth =
      change.additions >= MIN_TEST_ADDITIONS && testToSourceRatio > TEST_TO_SOURCE_RATIO_THRESHOLD;
    const hasLowValueScaffolding = mockLines.length >= MOCK_OR_SNAPSHOT_LINE_THRESHOLD;

    const hasTestBloat = hasDisproportionateGrowth && hasLowValueScaffolding;

    if (hasTestBloat) {
      const hasHighConfidenceEvidence =
        change.additions >= HIGH_TEST_ADDITIONS &&
        testToSourceRatio > HIGH_TEST_TO_SOURCE_RATIO &&
        mockLines.length >= HIGH_MOCK_OR_SNAPSHOT_LINES;

      findings.push({
        ruleId: "test-bloat",
        title: "Disproportionate low-value test growth",
        description: `${change.path} adds ${change.additions} test lines for ${sourceAdditions} source additions (${testToSourceRatio.toFixed(1)}x; threshold >${TEST_TO_SOURCE_RATIO_THRESHOLD.toFixed(1)}x) and includes ${mockLines.length} mock or snapshot lines (threshold ${MOCK_OR_SNAPSHOT_LINE_THRESHOLD}).`,
        severity: hasHighConfidenceEvidence ? "high" : "medium",
        category: "decay",
        file: change.path,
        line: mockLines[0]?.line ?? firstLine(change)
      });
    }

    if (!hasTestBloat && mockLines.length >= MOCK_OR_SNAPSHOT_LINE_THRESHOLD) {
      findings.push({
        ruleId: "heavy-mocking",
        title: "Heavy mocking in changed tests",
        description: `${change.path} adds ${mockLines.length} mock or snapshot lines, which may weaken regression confidence.`,
        severity: "medium",
        category: "coverage",
        file: change.path,
        line: mockLines[0]?.line
      });
    }
  }

  return findings;
}
