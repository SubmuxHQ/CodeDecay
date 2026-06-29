import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createTempDir, getFreePort, installFakePlaywright, run, startDemoApiServer, startDemoAppServer, startHealthServer, writeApiProductTargetConfig, writeDemoOpenApiSchema, writeFile, writeManualApiProductTargetConfig, writeProductTargetConfig } from "./helpers";

describe("codedecay product CLI contract", () => {
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

  it("refuses product exploration without configured targets", async () => {
    const cwd = createTempDir();

    const result = await run(["product", "--explore", "--format", "json"], cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("codedecay product execution workflows require at least one configured productTesting target.");
  });

  it("blocks product exploration until explicit command safety is enabled", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: false
    });

    try {
      const result = await run(["product", "--explore", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(report.summary.status).toBe("blocked");
      expect(report.targets[0]).toMatchObject({
        status: "blocked",
        exploration: {
          status: "blocked",
          driver: "playwright",
          error: "Product exploration requires safety.allowCommands to be true."
        }
      });
      expect(existsSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("reports missing project Playwright without installing packages or browsers", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(report.targets[0]).toMatchObject({
        status: "blocked",
        exploration: {
          status: "blocked",
          driver: "playwright"
        }
      });
      expect(report.targets[0].exploration.error).toContain("Playwright is not installed or cannot be loaded");
      expect(existsSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("uses project Playwright to crawl same-origin flows and write a flow-map artifact", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const artifactPath = join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json");
      const flowMap = JSON.parse(readFileSync(artifactPath, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.summary.status).toBe("passed");
      expect(report.targets[0].exploration).toMatchObject({
        status: "passed",
        driver: "playwright",
        artifactPath: ".codedecay/local/product-flow-maps/web/flow-map.json",
        pages: 2
      });
      expect(report.safety.browserAutomationRan).toBe(true);
      expect(flowMap).toMatchObject({
        schemaVersion: 1,
        target: {
          id: "web",
          baseUrl: server.origin,
          origin: server.origin
        },
        limits: {
          sameOrigin: true,
          maxPages: 5,
          allowDestructiveActions: false
        },
        summary: {
          pages: 2,
          blockedActions: expect.any(Number)
        }
      });
      expect(flowMap.pages.map((page: { path: string }) => page.path)).toEqual(["/", "/settings"]);
      expect(flowMap.pages[0].links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            href: `${server.origin}/settings`,
            text: "Settings & Details",
            sameOrigin: true,
            discovered: true
          }),
          expect.objectContaining({
            href: "https://example.com",
            text: "&lt;External&gt;",
            sameOrigin: false,
            discovered: false
          })
        ])
      );
      expect(JSON.stringify(flowMap.pages[0])).not.toContain("Hidden script action");
      expect(JSON.stringify(flowMap.pages[0])).not.toContain("hidden-style");
      expect(flowMap.blockedActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Delete user"
          })
        ])
      );

      const markdown = await run(["product", "--explore", "--max-pages", "1", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(0);
      expect(markdown.stdout).toContain("Flow map: `.codedecay/local/product-flow-maps/web/flow-map.json`");
      expect(markdown.stdout).toContain("Browser automation ran: yes");
    } finally {
      await server.close();
    }
  });

  it("honors product explorer max-page limits and destructive-action opt-in", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(
        ["product", "--explore", "--max-pages", "1", "--allow-destructive-actions", "--format", "json"],
        repo
      );
      const report = JSON.parse(result.stdout);
      const flowMap = JSON.parse(readFileSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].exploration).toMatchObject({
        pages: 1,
        blockedActions: 0
      });
      expect(flowMap.pages).toHaveLength(1);
      expect(flowMap.pages.map((page: { path: string }) => page.path)).toEqual(["/"]);
      expect(flowMap.summary.blockedActions).toBe(0);
      expect(flowMap.pages[0].interactiveElements.some((element: { destructive: boolean; blocked: boolean }) => element.destructive && !element.blocked)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("honors product explorer max-action limits", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--max-pages", "1", "--max-actions", "1", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const flowMap = JSON.parse(readFileSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].exploration).toMatchObject({
        interactiveElements: 1
      });
      expect(report.targets[0].exploration.skippedActions).toBeGreaterThan(0);
      expect(flowMap.summary).toMatchObject({
        interactiveElements: 1
      });
      expect(flowMap.summary.skippedActions).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("generates reviewable Playwright tests from a product flow map", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const sourcePath = join(repo, ".codedecay/local/generated-tests/web/product.generated.spec.ts");
      const manifestPath = join(repo, ".codedecay/local/generated-tests/web/manifest.json");
      const source = readFileSync(sourcePath, "utf8");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTests).toMatchObject({
        status: "passed",
        sourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts",
        manifestPath: ".codedecay/local/generated-tests/web/manifest.json"
      });
      expect(report.targets[0].generatedTests.tests.length).toBeGreaterThanOrEqual(3);
      expect(report.safety.generatedTestsRan).toBe(false);
      expect(source).toContain("@generated by CodeDecay");
      expect(source).toContain("getByRole('link'");
      expect(source).toContain("getByLabel");
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        reviewRequired: true,
        sourceFlowMapPath: ".codedecay/local/product-flow-maps/web/flow-map.json",
        testSourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts"
      });
      expect(manifest.tests.length).toBeGreaterThanOrEqual(3);
      expect(existsSync(join(repo, "tests/e2e/codedecay-product.spec.ts"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("runs generated Playwright tests through the project-local Playwright CLI", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--run-generated-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTestRun).toMatchObject({
        status: "passed",
        failed: 0,
        skipped: 0
      });
      expect(report.targets[0].generatedTestRun.passed).toBeGreaterThanOrEqual(3);
      expect(report.targets[0].generatedTestRun.command).toContain("node_modules/playwright/cli.js");
      expect(report.safety.generatedTestsRan).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("runs reviewed generated tests without overwriting local edits", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const generated = await run(["product", "--explore", "--generate-tests", "--max-pages", "5", "--format", "json"], repo);
      expect(generated.exitCode).toBe(0);

      const sourcePath = ".codedecay/local/generated-tests/web/product.generated.spec.ts";
      const reviewedSource = `${readFileSync(join(repo, sourcePath), "utf8")}\n// reviewed local edit\n`;
      writeFile(repo, sourcePath, reviewedSource);

      const result = await run(["product", "--run-generated-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTests.notes).toContain("Loaded existing generated tests without regenerating source.");
      expect(readFileSync(join(repo, sourcePath), "utf8")).toContain("// reviewed local edit");
    } finally {
      await server.close();
    }
  });

  it("reruns a single generated test by test id", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const generated = await run(["product", "--explore", "--generate-tests", "--max-pages", "5", "--format", "json"], repo);
      expect(generated.exitCode).toBe(0);
      const generatedReport = JSON.parse(generated.stdout);
      const testId = generatedReport.targets[0].generatedTests.tests[0].id;

      const result = await run(["product", "--run-generated-tests", "--test-id", testId, "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTestRun).toMatchObject({
        status: "passed",
        passed: 1,
        failed: 0
      });
      expect(report.targets[0].generatedTestRun.command).toContain("--grep");
    } finally {
      await server.close();
    }
  });

  it("reports generated test failures with source, failing step, and rerun command", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeFile(repo, "fail-generated-tests.txt", "yes\n");
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--run-generated-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const failure = report.targets[0].generatedTestRun.failures[0];

      expect(result.exitCode).toBe(1);
      expect(report.targets[0].status).toBe("failed");
      expect(report.targets[0].generatedTestRun).toMatchObject({
        status: "failed",
        failed: 1
      });
      expect(failure).toMatchObject({
        failingStep: expect.stringContaining("Run generated test"),
        testSourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts"
      });
      expect(failure.rerunCommand).toContain("npx codedecay product --target web --run-generated-tests --test-id ");
      expect(failure.rerunCommand).toContain(" --format markdown");
      expect(failure.error).toContain("Forced generated test failure");
      expect(failure.testSource).toContain("@generated by CodeDecay");
      expect(failure.testSource).toContain("test.describe");

      const markdown = await run(["product", "--generate-tests", "--run-generated-tests", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(1);
      expect(markdown.stdout).toContain("Failing step:");
      expect(markdown.stdout).toContain("Repeat evidence:");
      expect(markdown.stdout).toContain("Rerun: `npx codedecay product --target web --run-generated-tests --test-id ");
      expect(markdown.stdout).toContain("```ts");
      expect(markdown.stdout).toContain("@generated by CodeDecay");
    } finally {
      await server.close();
    }
  });

  it("records repeat evidence when a generated test passes on targeted rerun", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeFile(repo, "flaky-generated-tests.txt", "yes\n");
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--run-generated-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const failure = report.targets[0].generatedTestRun.failures[0];

      expect(result.exitCode).toBe(1);
      expect(failure.error).toContain("Flaky generated test failure");
      expect(failure.retryEvidence).toMatchObject({
        attempts: 2,
        passed: 1,
        failed: 1,
        conclusion: "passed-on-rerun"
      });
    } finally {
      await server.close();
    }
  });

  it("gates product failures by selected classification", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeFile(repo, "fail-generated-tests.txt", "yes\n");
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const reportOnly = await run(
        [
          "product",
          "--explore",
          "--generate-tests",
          "--run-generated-tests",
          "--max-pages",
          "5",
          "--fail-on-classification",
          "likely-flaky",
          "--format",
          "json"
        ],
        repo
      );
      const strictGate = await run(
        [
          "product",
          "--explore",
          "--generate-tests",
          "--run-generated-tests",
          "--max-pages",
          "5",
          "--fail-on-classification",
          "confirmed-regression",
          "--format",
          "json"
        ],
        repo
      );

      expect(reportOnly.exitCode).toBe(0);
      expect(JSON.parse(reportOnly.stdout).summary.status).toBe("failed");
      expect(strictGate.exitCode).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("generates reviewable API tests from a configured OpenAPI schema", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: false
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const sourcePath = join(repo, ".codedecay/local/generated-api-tests/api/api.generated.spec.ts");
      const manifestPath = join(repo, ".codedecay/local/generated-api-tests/api/manifest.json");
      const source = readFileSync(sourcePath, "utf8");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedApiTests).toMatchObject({
        status: "passed",
        sourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
        manifestPath: ".codedecay/local/generated-api-tests/api/manifest.json"
      });
      expect(report.targets[0].generatedApiTests.tests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "api-operation",
            method: "GET",
            operationPath: "/api/users",
            expectedStatuses: [200, 401]
          }),
          expect.objectContaining({
            method: "POST",
            destructive: true
          })
        ])
      );
      expect(source).toContain("@generated by CodeDecay");
      expect(source).toContain("CodeDecay generated API regression tests");
      expect(source).toContain('test.skip("POST /api/users returns a documented status"');
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        reviewRequired: true,
        sourceOpenApiSchemaPath: "docs/openapi.yaml",
        testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
        promoteByCopyingTo: "tests/api/codedecay-api.spec.ts"
      });
      expect(existsSync(join(repo, "tests/api/codedecay-api.spec.ts"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("prioritizes generated product checks from repo memory", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: false
    });
    writeFile(
      repo,
      ".codedecay/memory.json",
      JSON.stringify(
        {
          version: 1,
          flows: [
            {
              name: "User detail flow",
              files: ["README.md"],
              productPaths: ["/api/users/{id}"],
              checks: ["user detail stays readable after docs-linked changes"]
            }
          ],
          regressions: [
            {
              title: "Users list 500",
              description: "A previous generated product check caught a users list 500.",
              areas: ["api"],
              productPaths: ["/api/users"],
              severity: "high"
            }
          ]
        },
        null,
        2
      )
    );

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const tests = report.targets[0].generatedApiTests.tests;

      expect(result.exitCode).toBe(0);
      expect(tests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            operationPath: "/api/users",
            priority: "high"
          }),
          expect.objectContaining({
            method: "GET",
            operationPath: "/api/users/1",
            priority: "high"
          })
        ])
      );
    } finally {
      await server.close();
    }
  });

  it("generates API tests from manually configured endpoint lists", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    writeManualApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: false
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const source = readFileSync(join(repo, ".codedecay/local/generated-api-tests/api/api.generated.spec.ts"), "utf8");
      const manifest = JSON.parse(readFileSync(join(repo, ".codedecay/local/generated-api-tests/api/manifest.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedApiTests.tests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "list-users",
            method: "GET",
            operationPath: "/api/users",
            expectedStatuses: [200]
          }),
          expect.objectContaining({
            method: "POST",
            requestBody: {
              email: "codedecay@example.com"
            },
            destructive: true
          })
        ])
      );
      expect(source).toContain("x-codedecay-scenario");
      expect(source).toContain("codedecay@example.com");
      expect(manifest).toMatchObject({
        sourceApiEndpoints: "productTesting.targets.api.apiEndpoints",
        testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts"
      });
    } finally {
      await server.close();
    }
  });

  it("runs generated API tests through the project-local Playwright CLI", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedApiTestRun).toMatchObject({
        status: "passed",
        failed: 0
      });
      expect(report.targets[0].generatedApiTestRun.passed).toBeGreaterThanOrEqual(2);
      expect(report.targets[0].generatedApiTestRun.command).toContain("node_modules/playwright/cli.js");
      expect(report.safety.generatedTestsRan).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("reports generated API test failures with request evidence and rerun command", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeFile(repo, "fail-generated-tests.txt", "yes\n");
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const failure = report.targets[0].generatedApiTestRun.failures[0];

      expect(result.exitCode).toBe(1);
      expect(report.targets[0].status).toBe("failed");
      expect(failure).toMatchObject({
        testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
        request: {
          method: "GET"
        }
      });
      expect(failure.rerunCommand).toContain("npx codedecay product --target api --run-generated-api-tests --test-id ");
      expect(failure.rerunCommand).toContain(" --format markdown");
      expect(failure.request.url).toContain(`${server.origin}/api/users`);
      expect(failure.expected).toContain("documented statuses");
      expect(failure.actual).toContain("Forced generated test failure");
      expect(failure.impactedFiles).toContain("README.md");

      const markdown = await run(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(1);
      expect(markdown.stdout).toContain("API failure:");
      expect(markdown.stdout).toContain(`Request: GET \`${failure.request.url}\``);
      expect(markdown.stdout).toContain("Rerun: `npx codedecay product --target api --run-generated-api-tests --test-id ");
    } finally {
      await server.close();
    }
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
