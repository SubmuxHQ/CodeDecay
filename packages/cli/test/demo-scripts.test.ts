import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("demo scripts", () => {
  it("accepts pnpm-style argument separators for the end-user harness", () => {
    const output = execFileSync("node", ["scripts/end-user-demo.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/end-user-demo.mjs");
  });

  it("accepts pnpm-style argument separators for the published-package harness", () => {
    const output = execFileSync("node", ["scripts/published-package-demo.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/published-package-demo.mjs");
  });

  it("accepts pnpm-style argument separators for the PR safety eval harness", () => {
    const output = execFileSync("node", ["scripts/pr-safety-eval.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/pr-safety-eval.mjs");
  });
});
