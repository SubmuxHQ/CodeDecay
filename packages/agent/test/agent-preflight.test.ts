import { describe, expect, it } from "vitest";
import { createAgentPreflightReport } from "../src/preflight/report";

describe("agent preflight path classification", () => {
  it("distinguishes production src/tests modules from real test files", () => {
    const sourcePath = "packages/analyzer-js/src/tests/weak-audit/findings.ts";
    const testPath = "packages/analyzer-js/test/weak-audit/findings.test.ts";
    const report = createAgentPreflightReport({
      task: "Update weak audit findings and test proof",
      rootDir: "/repo",
      repoFiles: [sourcePath, testPath],
      generatedAt: "2026-07-22T00:00:00.000Z"
    });

    const sourceCandidate = report.deterministicEvidence.candidateFiles.find((file) => file.path === sourcePath);
    const testCandidate = report.deterministicEvidence.candidateFiles.find((file) => file.path === testPath);

    expect(sourceCandidate?.areas).toContain("source");
    expect(sourceCandidate?.areas).not.toContain("test");
    expect(testCandidate?.areas).toContain("test");
  });
});
