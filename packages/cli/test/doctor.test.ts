import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, run, writeFile } from "./helpers";

describe("codedecay doctor CLI contract", () => {
  it("prints markdown and JSON OSS recommendations", async () => {
    const repo = createDoctorRepo();

    const markdown = await run(["doctor", "--cwd", repo, "--format", "markdown"], createTempDir());
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stderr).toBe("");
    expect(markdown.stdout).toContain("## CodeDecay Doctor");
    expect(markdown.stdout).toContain("Semgrep");
    expect(markdown.stdout).toContain("Playwright");
    expect(markdown.stdout).toContain("Commands executed: no");

    const json = await run(["doctor", "--cwd", repo, "--format", "json"], createTempDir());
    expect(json.exitCode).toBe(0);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.safety.toolsInstalled).toBe(false);
    expect(parsed.recommendations.map((recommendation: { tool: { id: string } }) => recommendation.tool.id)).toContain("schemathesis");
  });

  it("writes output and a local-only config preview under the analyzed cwd", async () => {
    const repo = createDoctorRepo();

    const result = await run(
      ["doctor", "--cwd", repo, "--output", "codedecay-doctor.md", "--write-config-preview"],
      createTempDir()
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".codedecay/local/config-preview.yml");
    expect(readFileSync(join(repo, "codedecay-doctor.md"), "utf8")).toContain("## CodeDecay Doctor");
    const previewPath = join(repo, ".codedecay/local/config-preview.yml");
    expect(existsSync(previewPath)).toBe(true);
    const preview = readFileSync(previewPath, "utf8");
    expect(preview).toContain("allowCommands: false");
    expect(preview).toContain("toolAdapters:");
  });
});

function createDoctorRepo(): string {
  const repo = createTempDir();
  writeFile(
    repo,
    "package.json",
    JSON.stringify(
      {
        packageManager: "pnpm@11.8.0",
        scripts: { test: "vitest run" },
        dependencies: {
          next: "15.0.0",
          react: "19.0.0"
        },
        devDependencies: {
          vitest: "3.0.0"
        }
      },
      null,
      2
    )
  );
  writeFile(repo, "docs/openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n");
  writeFile(repo, "src/app/page.tsx", "export default function Page() { return <main />; }\n");
  return repo;
}
