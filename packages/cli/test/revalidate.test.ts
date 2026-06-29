import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHighRiskRepo, createLowRiskRepo, run, writeFile } from "./helpers";

describe("codedecay revalidate CLI contract", () => {
  it("prints markdown lifecycle status and previews memory without writing by default", async () => {
    const repo = createHighRiskRepo();
    const previousPath = join(repo, "previous-report.json");
    const previous = await run(["analyze", "--format", "json", "--output", previousPath], repo);

    expect(previous.exitCode).toBe(0);

    const result = await run(["revalidate", "--input", previousPath, "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Revalidation");
    expect(result.stdout).toContain("| Confirmed |");
    expect(result.stdout).toContain("Mode: preview only");
    expect(result.stdout).toContain("--apply-memory");
    expect(existsSync(join(repo, ".codedecay/memory.json"))).toBe(false);
  });

  it("writes previewed memory only with --apply-memory", async () => {
    const repo = createHighRiskRepo();
    const previousPath = join(repo, "previous-report.json");
    await run(["analyze", "--format", "json", "--output", previousPath], repo);

    const result = await run(["revalidate", "--input", previousPath, "--apply-memory", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);
    const memoryPath = join(repo, ".codedecay/memory.json");
    const memory = JSON.parse(readFileSync(memoryPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(report.memoryPreview.apply).toBe(true);
    expect(report.memoryPreview.writtenPath).toContain(".codedecay/memory.json");
    expect(memory.regressions.length).toBeGreaterThan(0);
    expect(memory.regressions[0].title).toContain("Revalidated confirmed");
  });

  it("marks prior findings as fixed when the weak-test rule no longer fires", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      "previous-report.json",
      JSON.stringify(
        {
          tool: "CodeDecay",
          version: "0.0.0-test",
          generatedAt: "2026-01-01T00:00:00.000Z",
          summary: {
            mergeRiskScore: 70,
            decayScore: 20,
            securityScore: 0,
            riskLevel: "high",
            findingCounts: { low: 0, medium: 0, high: 1 }
          },
          changedFiles: [],
          impactedAreas: [],
          findings: [
            {
              ruleId: "copied-implementation-in-test",
              title: "Test appears to copy implementation logic",
              description: "The changed test copied source logic.",
              severity: "high",
              category: "coverage",
              file: "src/auth/session.test.ts",
              line: 8
            }
          ],
          recommendedTests: []
        },
        null,
        2
      )
    );

    const result = await run(["revalidate", "--input", "previous-report.json", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary.fixed).toBe(1);
    expect(report.items[0].status).toBe("fixed");
    expect(report.memoryPreview.suggested.regressions).toBe(0);
  });

  it("honors explicit false-positive and accepted-risk marks", async () => {
    const repo = createHighRiskRepo();
    const previousPath = join(repo, "previous-report.json");
    await run(["analyze", "--format", "json", "--output", previousPath], repo);
    const previousReport = JSON.parse(readFileSync(previousPath, "utf8"));
    const findings = previousReport.findings.filter((entry: { file?: string }) => entry.file);
    const falsePositive = findings[0];
    const acceptedRisk = findings[1];
    const falsePositiveId = `finding:${falsePositive.ruleId}:${falsePositive.file}:${falsePositive.line ?? "unknown-line"}`;
    const acceptedRiskId = `finding:${acceptedRisk.ruleId}:${acceptedRisk.file}:${acceptedRisk.line ?? "unknown-line"}`;

    const result = await run(
      [
        "revalidate",
        "--input",
        previousPath,
        "--false-positive",
        falsePositiveId,
        "--accept-risk",
        acceptedRiskId,
        "--format",
        "json"
      ],
      repo
    );
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: falsePositiveId, status: "false-positive" }),
        expect.objectContaining({ id: acceptedRiskId, status: "accepted-risk" })
      ])
    );
  });
});
