import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTrendSnapshotComparison, loadTrendSnapshot } from "../src/renderers/snapshot";
import { createLowRiskRepo, createTempDir, git, run, writeFile } from "./helpers";

describe("codedecay snapshot CLI contract", () => {
  it("emits stable JSON snapshots and compares them with a previous artifact", async () => {
    const repo = createLowRiskRepo();

    const current = await run(["snapshot", "--format", "json"], repo);
    const currentSnapshot = JSON.parse(current.stdout);
    expect(current.exitCode).toBe(0);
    expect(currentSnapshot.tool).toBe("CodeDecay");
    expect(currentSnapshot.summary).toHaveProperty("mergeRiskScore");

    const previousPath = join(repo, "previous-snapshot.json");
    writeFile(
      repo,
      "previous-snapshot.json",
      JSON.stringify(
        {
          ...currentSnapshot,
          summary: {
            ...currentSnapshot.summary,
            mergeRiskScore: Math.max(0, currentSnapshot.summary.mergeRiskScore - 5),
            weakTestFindings: 0,
            impactedAreaKinds: []
          }
        },
        null,
        2
      )
    );

    const comparison = await run(["snapshot", "--compare", previousPath, "--format", "markdown"], repo);
    expect(comparison.exitCode).toBe(0);
    expect(comparison.stdout).toContain("## CodeDecay Snapshot Comparison");
    expect(comparison.stdout).toContain("| Merge risk |");
  });

  it("rejects malformed snapshot summaries before comparing arithmetic fields", async () => {
    const repo = createLowRiskRepo();
    const current = await run(["snapshot", "--format", "json"], repo);
    const currentSnapshot = JSON.parse(current.stdout);
    const malformedPath = join(repo, "malformed-snapshot.json");

    writeFile(
      repo,
      "malformed-snapshot.json",
      JSON.stringify(
        {
          ...currentSnapshot,
          summary: {
            ...currentSnapshot.summary,
            mergeRiskScore: "not-a-number"
          }
        },
        null,
        2
      )
    );

    expect(() => loadTrendSnapshot(malformedPath)).toThrow(/Invalid CodeDecay snapshot/);
    expect(() =>
      createTrendSnapshotComparison(currentSnapshot, {
        ...currentSnapshot,
        summary: {
          ...currentSnapshot.summary,
          mergeRiskScore: Number.NaN
        }
      })
    ).toThrow(/Invalid CodeDecay snapshot/);

    const comparison = await run(["snapshot", "--compare", malformedPath, "--format", "json"], repo);
    expect(comparison.exitCode).toBe(2);
    expect(comparison.stderr).toContain("Invalid CodeDecay snapshot");
    expect(comparison.stdout).toBe("");
  });

  it("emits a clean snapshot for git repositories with no commits", async () => {
    const repo = createTempDir();
    git(repo, ["init", "-b", "main"]);
    writeFile(repo, "src/app.ts", "export const value = 1;\n");

    const result = await run(["snapshot", "--format", "json"], repo);
    const snapshot = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(snapshot.tool).toBe("CodeDecay");
    expect(snapshot.summary.changedFiles).toBe(1);
  });
});
