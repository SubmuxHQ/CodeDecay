import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createTempDir, getFreePort, installFakePlaywright, run, startDemoApiServer, startDemoAppServer, startHealthServer, writeApiProductTargetConfig, writeDemoOpenApiSchema, writeFile, writeManualApiProductTargetConfig, writeProductTargetConfig } from "./helpers";

describe("codedecay product target CLI contract", () => {
  it("prints a skipped report when no product targets are configured", async () => {
    const cwd = createTempDir();

    const result = await run(["product", "--format", "json"], cwd);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 0,
      skipped: 0
    });
    expect(report.targets).toEqual([]);
    expect(report.safety).toMatchObject({
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("health-checks an already running product target without executing commands", async () => {
    const server = await startHealthServer();
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    web:",
        `      baseUrl: ${server.origin}`,
        `      healthCheck: ${server.healthUrl}`,
        "      timeoutMs: 1000",
        ""
      ].join("\n")
    );

    try {
      const result = await run(["product", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.summary).toMatchObject({
        status: "passed",
        total: 1,
        passed: 1
      });
      expect(report.targets[0]).toMatchObject({
        id: "web",
        status: "passed",
        baseUrl: server.origin,
        healthCheck: server.healthUrl,
        health: {
          status: "passed",
          httpStatus: 204
        }
      });
      expect(report.safety.commandsExecuted).toBe(false);

      const markdown = await run(["product", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(0);
      expect(markdown.stdout).toContain("## CodeDecay Product Target Report");
      expect(markdown.stdout).toContain("**web** Passed");
      expect(markdown.stdout).toContain("Commands executed: no");
    } finally {
      await server.close();
    }
  });

  it("blocks startup commands unless safety.allowCommands is explicitly enabled", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "blocked-start.mjs", "import { writeFileSync } from 'node:fs';\nwriteFileSync('should-not-exist.txt', 'ran');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    web:",
        `      startCommand: ${JSON.stringify(`${process.execPath} blocked-start.mjs`)}`,
        "      healthCheck: http://127.0.0.1:9/health",
        "      timeoutMs: 1000",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    );

    const result = await run(["product", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "blocked",
      total: 1,
      blocked: 1
    });
    expect(report.targets[0]).toMatchObject({
      id: "web",
      status: "blocked",
      start: {
        status: "blocked",
        blockedReason: "safety.allowCommands is false"
      }
    });
    expect(report.safety.commandsExecuted).toBe(false);
    expect(existsSync(join(repo, "should-not-exist.txt"))).toBe(false);
  });

  it("starts, health-checks, stops, and tears down an allowed local product target", async () => {
    const repo = createLowRiskRepo();
    const port = await getFreePort();
    writeFile(
      repo,
      "product-server.mjs",
      [
        "import { createServer } from 'node:http';",
        "import { writeFileSync } from 'node:fs';",
        "const port = Number(process.argv[2]);",
        "writeFileSync('started.txt', 'yes');",
        "const server = createServer((request, response) => {",
        "  if (request.url === '/health') {",
        "    response.writeHead(200);",
        "    response.end('ok');",
        "    return;",
        "  }",
        "  response.writeHead(404);",
        "  response.end('not found');",
        "});",
        "server.listen(port, '127.0.0.1');",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        ""
      ].join("\n")
    );
    writeFile(repo, "teardown.mjs", "import { writeFileSync } from 'node:fs';\nwriteFileSync('teardown.txt', 'yes');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    web:",
        `      startCommand: ${JSON.stringify(`${process.execPath} product-server.mjs ${port}`)}`,
        `      healthCheck: http://127.0.0.1:${port}/health`,
        `      teardownCommand: ${JSON.stringify(`${process.execPath} teardown.mjs`)}`,
        "      timeoutMs: 3000",
        "safety:",
        "  allowCommands: true",
        ""
      ].join("\n")
    );

    const result = await run(["product", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.targets[0]).toMatchObject({
      id: "web",
      status: "passed",
      start: {
        status: "started"
      },
      health: {
        status: "passed",
        httpStatus: 200
      },
      teardown: {
        status: "passed"
      }
    });
    expect(report.safety.commandsExecuted).toBe(true);
    expect(readFileSync(join(repo, "started.txt"), "utf8")).toBe("yes");
    expect(readFileSync(join(repo, "teardown.txt"), "utf8")).toBe("yes");
  });

  it("fails clearly when a requested product target is unknown", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      ["version: 1", "productTesting:", "  targets:", "    web:", "      baseUrl: http://127.0.0.1:3000", ""].join("\n")
    );

    const result = await run(["product", "--target", "mobile", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Unknown product target "mobile". Available targets: web.');
  });
});
