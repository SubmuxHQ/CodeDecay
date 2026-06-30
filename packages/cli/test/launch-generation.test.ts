import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("launch copy generation", () => {
  it("renders README and launch copy from benchmark JSON and is idempotent", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "codedecay-launch-"));
    const benchmarkPath = join(tempDir, "benchmark.json");
    const readmePath = join(tempDir, "README.md");
    const launchPostPath = join(tempDir, "launch-post.md");

    writeFileSync(
      benchmarkPath,
      JSON.stringify(
        {
          summary: {
            totalExpected: 8,
            totalMatched: 7,
            overallRecall: 0.875,
            falsePositiveRate: 0.125,
            costUsd: 0,
            llmCalled: false,
            telemetrySent: false
          }
        },
        null,
        2
      ),
      "utf8"
    );
    writeFileSync(
      readmePath,
      ["# Fixture", "", "<!-- BENCHMARK:START -->", "old benchmark copy", "<!-- BENCHMARK:END -->", ""].join("\n"),
      "utf8"
    );

    runGenerator(benchmarkPath, readmePath, launchPostPath);
    const firstReadme = readFileSync(readmePath, "utf8");
    const firstLaunchPost = readFileSync(launchPostPath, "utf8");

    expect(firstReadme).toContain("7/8 planted issues caught (87.50% recall)");
    expect(firstReadme).toContain("12.50% false-positive rate");
    expect(firstReadme).toContain("$0.00 cost");
    expect(firstReadme).toContain("LLM called: **no**");
    expect(firstReadme).toContain("telemetry sent: **no**");
    expect(firstReadme).not.toContain("old benchmark copy");
    expect(firstLaunchPost).toContain("7/8 planted issues caught (87.50% recall)");
    expect(firstLaunchPost).toContain("LLM called: no, telemetry sent: no");

    runGenerator(benchmarkPath, readmePath, launchPostPath);

    expect(readFileSync(readmePath, "utf8")).toBe(firstReadme);
    expect(readFileSync(launchPostPath, "utf8")).toBe(firstLaunchPost);
  });
});

function runGenerator(benchmarkPath: string, readmePath: string, launchPostPath: string): void {
  execFileSync(
    process.execPath,
    [
      "scripts/gen-launch.mjs",
      "--benchmark-json",
      benchmarkPath,
      "--readme",
      readmePath,
      "--launch-post",
      launchPostPath
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}
