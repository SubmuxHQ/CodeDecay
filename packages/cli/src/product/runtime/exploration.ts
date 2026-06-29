import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  captureProductScreenshot,
  extractHtmlTitle,
  extractProductFlowPage,
  normalizeExploreUrl,
  resolveProductExploreBaseUrl,
  sanitizeArtifactSegment,
  type ProductPlaywrightPage
} from "../exploration";
import type {
  ProductBlockedAction,
  ProductExplorationResult,
  ProductExplorerOptions,
  ProductFlowMap,
  ProductFlowPage,
  ProductHealthResult
} from "../../types";
import { elapsed } from "./timing";

export async function exploreProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult,
  options: ProductExplorerOptions
): Promise<ProductExplorationResult> {
  const startedAt = Date.now();
  const baseUrl = resolveProductExploreBaseUrl(target, health);
  const notes = [
    "Explorer uses same-origin crawling by default.",
    "Destructive forms and actions are recorded as blocked unless --allow-destructive-actions is set."
  ];

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires safety.allowCommands to be true.",
      notes
    };
  }

  if (!baseUrl) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires a baseUrl, resolved previewUrlEnv, or healthCheck URL.",
      notes
    };
  }

  const playwright = loadProjectPlaywright(rootDir);
  if (!playwright.ok) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: playwright.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install browsers or packages."]
    };
  }

  let browser: ProductPlaywrightBrowser | undefined;
  try {
    browser = await playwright.module.chromium.launch({ headless: true });
    const artifactRoot = join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(target.id));
    const flowMap = await crawlProductFlowMap({
      browser,
      rootDir,
      artifactRoot,
      target,
      baseUrl,
      options,
      timeoutMs: target.timeoutMs
    });
    const artifactPath = join(artifactRoot, "flow-map.json");
    writeOutput(rootDir, artifactPath, `${JSON.stringify(flowMap, null, 2)}\n`);

    return {
      status: "passed",
      driver: "playwright",
      artifactPath,
      pages: flowMap.summary.pages,
      interactiveElements: flowMap.summary.interactiveElements,
      blockedActions: flowMap.summary.blockedActions,
      skippedActions: flowMap.summary.skippedActions,
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: `Playwright product exploration failed: ${message}`,
      notes: [...notes, "CodeDecay does not install Playwright browsers; run the project's normal Playwright setup if browser launch fails."]
    };
  } finally {
    await browser?.close?.();
  }
}

interface ProductPlaywrightModule {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<ProductPlaywrightBrowser>;
  };
}

interface ProductPlaywrightBrowser {
  newPage: () => Promise<ProductPlaywrightPage>;
  close?: () => Promise<void>;
}

function loadProjectPlaywright(rootDir: string): { ok: true; module: ProductPlaywrightModule } | { ok: false; error: string } {
  try {
    const projectRequire = createRequire(join(rootDir, "package.json"));
    const loaded = projectRequire("playwright") as Partial<ProductPlaywrightModule>;
    if (!loaded.chromium?.launch) {
      return {
        ok: false,
        error: "Project Playwright package does not expose chromium.launch."
      };
    }

    return {
      ok: true,
      module: loaded as ProductPlaywrightModule
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Playwright is not installed or cannot be loaded from the target project: ${message}`
    };
  }
}

async function crawlProductFlowMap(input: {
  browser: ProductPlaywrightBrowser;
  rootDir: string;
  artifactRoot: string;
  target: CodeDecayProductTarget;
  baseUrl: string;
  options: ProductExplorerOptions;
  timeoutMs: number;
}): Promise<ProductFlowMap> {
  const startUrl = normalizeExploreUrl(input.baseUrl);
  const origin = new URL(startUrl).origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const queued = new Set([startUrl]);
  const visited = new Set<string>();
  const pages: ProductFlowPage[] = [];
  const crawlState = {
    recordedActions: 0,
    skippedActions: 0,
    blockedActions: [] as ProductBlockedAction[]
  };
  const page = await input.browser.newPage();

  try {
    while (queue.length > 0 && pages.length < input.options.maxPages) {
      const next = queue.shift();
      if (!next || visited.has(next.url)) {
        continue;
      }

      visited.add(next.url);
      await page.goto(next.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(input.timeoutMs, 30_000)
      });
      const currentUrl = normalizeExploreUrl(page.url?.() ?? next.url);
      if (new URL(currentUrl).origin !== origin) {
        continue;
      }

      const html = await page.content();
      const title = page.title ? await page.title().catch(() => extractHtmlTitle(html)) : extractHtmlTitle(html);
      const extracted = extractProductFlowPage({
        url: currentUrl,
        html,
        origin,
        depth: next.depth,
        options: input.options,
        state: crawlState
      });
      const screenshotPath = await captureProductScreenshot({
        page,
        rootDir: input.rootDir,
        artifactRoot: input.artifactRoot,
        url: currentUrl
      });

      pages.push({
        ...extracted,
        title: title || extracted.title,
        ...(screenshotPath ? { screenshotPath } : {})
      });

      for (const link of extracted.links) {
        if (!link.discovered || queued.has(link.href) || visited.has(link.href)) {
          continue;
        }

        queued.add(link.href);
        queue.push({ url: link.href, depth: next.depth + 1 });
      }
    }
  } finally {
    await page.close?.();
  }

  const interactiveElements = pages.reduce((count, item) => count + item.interactiveElements.length, 0);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: input.target.id,
      baseUrl: startUrl,
      origin
    },
    driver: "playwright",
    limits: {
      sameOrigin: true,
      maxPages: input.options.maxPages,
      maxActions: input.options.maxActions,
      allowDestructiveActions: input.options.allowDestructiveActions
    },
    summary: {
      pages: pages.length,
      interactiveElements,
      blockedActions: crawlState.blockedActions.length,
      skippedActions: crawlState.skippedActions
    },
    pages,
    blockedActions: crawlState.blockedActions
  };
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}
