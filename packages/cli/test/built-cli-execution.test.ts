import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createHighRiskRepo,
  createLowRiskRepo,
  createMediumRiskRepo,
  createNextjsExampleRepo,
  createNodeApiExampleRepo,
  createRepo,
  createTempDir,
  currentCliVersion,
  ensureBuiltCli,
  git,
  gitOutput,
  repoRoot,
  runBuilt,
  writeFile
} from "./helpers/built-cli";

beforeAll(ensureBuiltCli);

describe("built codedecay CLI execution workflows", () => {
  it("executes configured commands from the built CLI", () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"console.log('built execute ok')\"",
        "probes: []",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const executeHelp = runBuilt(["execute", "--help"]);
    expect(executeHelp.status).toBe(0);
    expect(executeHelp.stdout).toContain("CodeDecay execute");
    expect(executeHelp.stdout).toContain("--output <path>");

    const result = runBuilt(["execute", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.summary.status).toBe("passed");
    expect(report.results[0]).toMatchObject({
      kind: "test",
      status: "passed",
      stdout: "built execute ok\n"
    });
  });

  it("executes configured tool adapters from the built CLI", () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "playwright-pass.js", "console.log('built browser flow ok');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  playwright:",
        "    command: node playwright-pass.js",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = runBuilt(["execute", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.results).toEqual([]);
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "playwright",
      command: "node playwright-pass.js",
      status: "passed"
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "browser-flow",
      metadata: {
        stdout: "built browser flow ok"
      }
    });
  });
});
