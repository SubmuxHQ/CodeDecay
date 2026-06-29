import { describe, expect, it } from "vitest";
import { createDoctorReport, renderConfigPreview, renderDoctorReport } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("OSS tool doctor recommendations", () => {
  it("detects repo signals and recommends existing OSS tools without execution", () => {
    const repo = createTempDir();
    writeFile(
      repo,
      "package.json",
      JSON.stringify(
        {
          packageManager: "pnpm@11.8.0",
          scripts: {
            test: "vitest run"
          },
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
    writeFile(repo, ".github/workflows/ci.yml", "name: ci\n");

    const report = createDoctorReport(repo);

    expect(report.safety).toEqual({
      commandsExecuted: false,
      toolsInstalled: false,
      networkUsed: false,
      llmCalled: false,
      telemetrySent: false
    });
    expect(report.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "framework", value: "nextjs" }),
        expect.objectContaining({ kind: "api-schema", value: "openapi", source: "docs/openapi.yaml" }),
        expect.objectContaining({ kind: "test-runner", value: "vitest" })
      ])
    );
    expect(report.recommendations.map((recommendation) => recommendation.tool.id)).toEqual(
      expect.arrayContaining(["semgrep", "playwright", "schemathesis", "stryker", "coverage", "osv-scanner"])
    );

    const markdown = renderDoctorReport(report, "markdown");
    expect(markdown).toContain("## CodeDecay Doctor");
    expect(markdown).toContain("Tools installed: no");
    expect(markdown).toContain("Semgrep");
    expect(markdown).toContain("Schemathesis");

    const json = JSON.parse(renderDoctorReport(report, "json"));
    expect(json.recommendations[0].tool.name).toBeTruthy();
  });

  it("renders a reviewable local config preview without enabling execution", () => {
    const repo = createTempDir();
    writeFile(
      repo,
      "package.json",
      JSON.stringify(
        {
          packageManager: "pnpm@11.8.0",
          scripts: { test: "vitest run" },
          dependencies: { express: "5.0.0" },
          devDependencies: { vitest: "3.0.0" }
        },
        null,
        2
      )
    );
    writeFile(repo, "docs/openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n");

    const preview = renderConfigPreview(createDoctorReport(repo));

    expect(preview).toContain("version: 1");
    expect(preview).toContain("allowCommands: false");
    expect(preview).toContain("semgrep:");
    expect(preview).toContain("schemathesis:");
    expect(preview).toContain("schema: docs/openapi.yaml");
    expect(preview).toContain("CodeDecay does not install or run these tools from doctor.");
  });
});
