import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createTempDir, getFreePort, installFakePlaywright, run, startDemoApiServer, startDemoAppServer, startHealthServer, writeApiProductTargetConfig, writeDemoOpenApiSchema, writeFile, writeManualApiProductTargetConfig, writeProductTargetConfig } from "./helpers";

describe("codedecay product exploration CLI contract", () => {
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
});
