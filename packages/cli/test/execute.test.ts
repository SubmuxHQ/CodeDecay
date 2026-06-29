import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createTempDir, run, writeExecutionConfig, writeFile } from "./helpers";

describe("codedecay execute CLI contract", () => {
  it("skips configured commands unless safety.allowCommands is true", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"console.log('should not run')\"",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 1,
      skipped: 1
    });
    expect(report.results[0]).toMatchObject({
      kind: "test",
      status: "skipped",
      stdout: ""
    });
  });

  it("runs configured test, build, start, and probe commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\"",
      buildCommand: "node -e \"console.log('build ok')\"",
      startCommand: "node -e \"console.log('start ok')\"",
      probeCommand: "node -e \"console.log('probe ok')\""
    });

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 4,
      passed: 4
    });
    expect(report.results.map((item: { kind: string }) => item.kind)).toEqual(["test", "build", "start", "probe"]);
    expect(report.results.map((item: { stdout: string }) => item.stdout)).toEqual([
      "test ok\n",
      "build ok\n",
      "start ok\n",
      "probe ok\n"
    ]);
  });

  it("skips configured tool adapters unless safety.allowCommands is true", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  playwright:",
        "    command: node playwright-should-not-run.js",
        "safety:",
        "  allowCommands: false",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );
    writeFile(repo, "playwright-should-not-run.js", "require('fs').writeFileSync('adapter-ran.txt', 'yes');\n");

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 1,
      skipped: 1
    });
    expect(report.results).toEqual([]);
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "playwright",
      command: "node playwright-should-not-run.js",
      status: "skipped"
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "browser-flow",
      severity: "info"
    });
    expect(existsSync(join(repo, "adapter-ran.txt"))).toBe(false);
  });

  it("runs configured tool adapters and returns normalized evidence", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "playwright-pass.js", "console.log('browser flow ok');\n");
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

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "playwright",
      command: "node playwright-pass.js",
      status: "passed",
      summary: "Playwright checks passed."
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "browser-flow",
      severity: "info",
      metadata: {
        status: "passed",
        stdout: "browser flow ok"
      }
    });

    const markdown = await run(["execute", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("### Tool Adapter Results");
    expect(markdown.stdout).toContain("Playwright");
    expect(markdown.stdout).toContain("browser-flow");
  });

  it("runs a configured agent process adapter with a generated CodeDecay bundle", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      "local-agent.js",
      [
        "const fs = require('node:fs');",
        "const bundle = fs.readFileSync(process.env.CODEDECAY_AGENT_BUNDLE_PATH, 'utf8');",
        "console.log(`profile=${process.env.CODEDECAY_AGENT_PROFILE}`);",
        "console.log(`format=${process.env.CODEDECAY_AGENT_BUNDLE_FORMAT}`);",
        "console.log(`hasPrompt=${bundle.includes('CodeDecay agent task bundle')}`);"
      ].join("\n")
    );
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  agentProcess:",
        "    command: node local-agent.js",
        "    profile: codex",
        "    bundleFormat: markdown",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "agent-process",
      name: "Agent Process",
      command: "node local-agent.js",
      status: "passed"
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "agent-suggestion",
      severity: "low",
      trusted: false,
      artifactPath: ".codedecay/local/agent-process/bundle.md",
      metadata: expect.objectContaining({
        profile: "codex",
        bundleFormat: "markdown",
        stdout: expect.stringContaining("profile=codex"),
        untrusted: true
      })
    });
    expect(readFileSync(join(repo, ".codedecay/local/agent-process/bundle.md"), "utf8")).toContain(
      "Target agent profile: Codex"
    );
  });

  it("surfaces StrykerJS survivor evidence from configured mutation reports", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "stryker-pass.js", "console.log('mutation done');\n");
    writeFile(
      repo,
      "reports/mutation/mutation.json",
      JSON.stringify(
        {
          files: {
            "src/math.ts": {
              mutants: [
                {
                  id: "1",
                  status: "Survived",
                  mutatorName: "ArithmeticOperator",
                  location: { start: { line: 4, column: 2 }, end: { line: 4, column: 10 } }
                }
              ]
            }
          }
        },
        null,
        2
      )
    );
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  stryker:",
        "    command: node stryker-pass.js",
        "    reportPath: reports/mutation/mutation.json",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "failed",
      total: 1,
      failed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "stryker",
      status: "failed",
      failure: {
        mode: "no-evidence"
      }
    });
    expect(report.toolAdapters[0].evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mutation",
          severity: "high",
          summary: "Survived ArithmeticOperator mutant in src/math.ts:4.",
          file: "src/math.ts",
          line: 4,
          artifactPath: "reports/mutation/mutation.json"
        })
      ])
    );
  });

  it("runs configured Semgrep adapter and returns static-analysis evidence", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      "semgrep-json.js",
      [
        "console.log(JSON.stringify({",
        "  results: [{",
        "    check_id: 'javascript.express.security.audit.xss',",
        "    path: 'src/app.ts',",
        "    start: { line: 12, col: 3 },",
        "    end: { line: 12, col: 21 },",
        "    extra: {",
        "      message: 'User input reaches response',",
        "      severity: 'ERROR',",
        "      metadata: { category: 'security', confidence: 'HIGH', technology: ['express'] }",
        "    }",
        "  }]",
        "}));",
        ""
      ].join("\n")
    );
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  semgrep:",
        "    command: node semgrep-json.js",
        "    failOnSeverity: high",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "failed",
      total: 1,
      failed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "semgrep",
      name: "Semgrep",
      command: "node semgrep-json.js",
      status: "failed",
      failure: {
        mode: "tool-finding"
      }
    });
    expect(report.toolAdapters[0].evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "static-analysis",
          severity: "high",
          summary: "javascript.express.security.audit.xss: User input reaches response in src/app.ts:12.",
          file: "src/app.ts",
          line: 12
        })
      ])
    );

    const markdown = await run(["execute", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(1);
    expect(markdown.stdout).toContain("Semgrep");
    expect(markdown.stdout).toContain("static-analysis");
    expect(markdown.stdout).toContain("User input reaches response");
  });

  it("collects configured coverage artifacts and returns coverage evidence", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      "coverage/coverage-final.json",
      JSON.stringify({
        "src/app.ts": {
          l: {
            "1": 1,
            "2": 0
          }
        }
      })
    );
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  coverage:",
        "    reportPaths:",
        "      - coverage/coverage-final.json",
        "    failOn: uncovered",
        "safety:",
        "  allowCommands: false",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "failed",
      total: 1,
      failed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "coverage",
      name: "Coverage",
      command: "collect coverage artifacts",
      status: "failed",
      failure: {
        mode: "tool-finding"
      }
    });
    expect(report.toolAdapters[0].evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "coverage",
          severity: "high",
          summary: "Coverage artifacts measured 2 line(s); 1 line(s) are uncovered."
        }),
        expect.objectContaining({
          kind: "coverage",
          file: "src/app.ts",
          line: 2,
          artifactPath: "coverage/coverage-final.json"
        })
      ])
    );

    const markdown = await run(["execute", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(1);
    expect(markdown.stdout).toContain("Coverage");
    expect(markdown.stdout).toContain("coverage");
    expect(markdown.stdout).toContain("uncovered measured line");
  });

  it("returns exit 1 and reports failures from configured tool adapters", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "pact-fail.js", "console.error('contract mismatch'); process.exit(15);\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  pact:",
        "    command: node pact-fail.js",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "failed",
      total: 1,
      failed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "pact",
      command: "node pact-fail.js",
      status: "failed",
      failure: {
        mode: "nonzero-exit"
      }
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "contract",
      severity: "high"
    });
  });

  it("returns exit 1 and reports failures from configured commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\"",
      probeCommand: "node -e \"console.error('probe failed'); process.exit(3)\""
    });

    const result = await run(["execute", "--format", "markdown"], repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("## CodeDecay Execution Report");
    expect(result.stdout).toContain("**Overall status:** Failed");
    expect(result.stdout).toContain("Exit code: 3");
    expect(result.stdout).toContain("probe failed");
  });

  it("writes execution reports to relative --output paths from --cwd", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\""
    });

    const result = await run(["execute", "--cwd", repo, "--format", "json", "--output", "codedecay-execute.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-execute.json");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });
});
