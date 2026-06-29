import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, run, writeDashboardProductRun, writeFile } from "./helpers";

describe("codedecay dashboard CLI contract", () => {
  it("discovers product artifacts and writes a static dashboard with failure bundle links", async () => {
    const repo = createLowRiskRepo();
    writeDashboardProductRun(repo, ".codedecay/local/product-runs/run-1.json", {
      generatedAt: "2026-06-27T10:00:00.000Z",
      status: "failed",
      targetId: "api",
      baseUrl: "http://127.0.0.1:3000?token=secret",
      requestUrl: "http://127.0.0.1:3000/api/users?token=secret",
      error: "Expected documented status 200 but got 500."
    });
    writeDashboardProductRun(repo, ".codedecay/local/product-trends/run-2.json", {
      generatedAt: "2026-06-27T11:00:00.000Z",
      status: "passed",
      targetId: "web",
      baseUrl: "http://127.0.0.1:3000",
      requestUrl: "http://127.0.0.1:3000/settings",
      error: ""
    });
    writeFile(repo, "public/codedecay-dashboard/failures/stale.md", "old failure bundle");

    const result = await run(["dashboard", "--output", "public/codedecay-dashboard", "--format", "json"], repo);
    const dashboard = JSON.parse(result.stdout);
    const outputDir = join(repo, "public/codedecay-dashboard");
    const failure = dashboard.failures[0];

    expect(result.exitCode).toBe(0);
    expect(dashboard.summary).toMatchObject({
      runs: 2,
      targets: 2,
      failures: 1,
      confirmedRegressions: 1
    });
    expect(existsSync(join(outputDir, "index.html"))).toBe(true);
    expect(existsSync(join(outputDir, "dashboard.json"))).toBe(true);
    expect(existsSync(join(outputDir, failure.jsonPath))).toBe(true);
    expect(existsSync(join(outputDir, failure.markdownPath))).toBe(true);
    expect(existsSync(join(outputDir, "failures/stale.md"))).toBe(false);
    expect(readFileSync(join(outputDir, "index.html"), "utf8")).toContain("CodeDecay Product Dashboard");
    expect(readFileSync(join(outputDir, "index.html"), "utf8")).toContain(failure.markdownPath);
  });

  it("redacts sensitive product dashboard values by default", async () => {
    const repo = createLowRiskRepo();
    writeDashboardProductRun(repo, ".codedecay/local/product-runs/secret-run.json", {
      generatedAt: "2026-06-27T10:00:00.000Z",
      status: "failed",
      targetId: "api",
      baseUrl: "http://127.0.0.1:3000?token=secret",
      requestUrl: "http://127.0.0.1:3000/api/users?token=secret",
      error: "Bearer supersecret failed for user@example.com token=abc123"
    });

    const result = await run(["dashboard", "--format", "markdown"], repo);
    const dashboardPath = join(repo, ".codedecay/local/dashboard/dashboard.json");
    const htmlPath = join(repo, ".codedecay/local/dashboard/index.html");
    const serialized = `${readFileSync(dashboardPath, "utf8")}\n${readFileSync(htmlPath, "utf8")}`;

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Product Dashboard");
    expect(serialized).not.toContain("supersecret");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("token=abc123");
    expect(serialized).not.toContain("?token=secret");
    expect(serialized).toContain("Bearer [redacted]");
  });
});
