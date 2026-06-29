import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, run, writeFile } from "./helpers";

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
});
