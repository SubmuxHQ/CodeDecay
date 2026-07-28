import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileChange } from "@submuxhq/codedecay-core";

interface TestBloatRegressionFixture {
  issue: number;
  baseCommit: string;
  headCommit: string;
  testPath: string;
  testAdditions: number;
  sourceAdditions: number;
  assertionLines: number;
  mockOrSnapshotLines: number;
}

export function issue724TestBloatChanges(): {
  changedFiles: FileChange[];
  changedSourceFiles: FileChange[];
  fixture: TestBloatRegressionFixture;
} {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), "packages/analyzer-js/fixtures/test-bloat/issue-724.json"),
      "utf8"
    )
  ) as TestBloatRegressionFixture;
  const testChange: FileChange = {
    path: fixture.testPath,
    status: "added",
    additions: fixture.testAdditions,
    deletions: 0,
    addedLines: Array.from({ length: fixture.testAdditions }, (_, index) => ({
      line: index + 1,
      content:
        index < fixture.assertionLines
          ? `expect(result.case${index}).toEqual(expected.case${index});`
          : `const fixtureValue${index} = ${index};`
    }))
  };
  const sourceChange: FileChange = {
    path: "packages/core/src/impact-graph/normalize.ts",
    status: "modified",
    additions: fixture.sourceAdditions,
    deletions: 0,
    addedLines: [{ line: 1, content: "export function normalizeImpactGraph() { return {}; }" }]
  };

  return {
    changedFiles: [sourceChange, testChange],
    changedSourceFiles: [sourceChange],
    fixture
  };
}
