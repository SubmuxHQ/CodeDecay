import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type {
  ProductBlockedAction,
  ProductExplorerOptions,
  ProductFlowPage,
  ProductHealthResult
} from "../types";
import { extractHtmlTitle } from "./exploration/html";
import { extractProductInteractiveElements, extractProductLinks } from "./exploration/interactive";

export { extractHtmlTitle, normalizeWhitespace } from "./exploration/html";

export interface ProductPlaywrightPage {
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  title?: () => Promise<string>;
  url?: () => string;
  screenshot?: (options: { path: string; fullPage: boolean }) => Promise<unknown>;
  close?: () => Promise<void>;
}

export function resolveProductExploreBaseUrl(target: CodeDecayProductTarget, health: ProductHealthResult): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  const healthOrigin = resolveMaybeUrl(health.url, health.url);
  return healthOrigin ? new URL(healthOrigin).origin : undefined;
}

export function normalizeExploreUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "") || url.origin;
}

export function resolveMaybeUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return undefined;
  }
}

export async function captureProductScreenshot(input: {
  page: ProductPlaywrightPage;
  rootDir: string;
  artifactRoot: string;
  url: string;
}): Promise<string | undefined> {
  if (!input.page.screenshot) {
    return undefined;
  }

  const screenshotPath = join(input.artifactRoot, "screenshots", `${sanitizeArtifactSegment(new URL(input.url).pathname || "root")}.png`);
  try {
    mkdirSync(dirname(join(input.rootDir, screenshotPath)), { recursive: true });
    await input.page.screenshot({
      path: join(input.rootDir, screenshotPath),
      fullPage: true
    });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

export function extractProductFlowPage(input: {
  url: string;
  html: string;
  origin: string;
  depth: number;
  options: ProductExplorerOptions;
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  };
}): ProductFlowPage {
  const links = extractProductLinks({
    html: input.html,
    baseUrl: input.url,
    origin: input.origin,
    resolveUrl: resolveMaybeUrl
  });
  const interactiveElements = extractProductInteractiveElements({
    html: input.html,
    pageUrl: input.url,
    baseUrl: input.url,
    links,
    options: input.options,
    state: input.state,
    resolveUrl: resolveMaybeUrl
  });

  return {
    url: input.url,
    title: extractHtmlTitle(input.html),
    path: new URL(input.url).pathname || "/",
    depth: input.depth,
    links,
    interactiveElements
  };
}

export function sanitizeArtifactSegment(value: string): string {
  return slugifyAllowedAscii(value, "root", 160, isArtifactSegmentChar);
}

export function slugifyLowerAscii(value: string, fallback: string, maxLength: number): string {
  return slugifyAllowedAscii(value.toLowerCase(), fallback, maxLength, isLowerAsciiAlphaNumeric);
}

function slugifyAllowedAscii(
  value: string,
  fallback: string,
  maxLength: number,
  allowed: (char: string) => boolean
): string {
  let slug = "";
  let pendingSeparator = false;

  for (const char of value) {
    if (allowed(char)) {
      if (pendingSeparator && slug.length > 0 && slug.length < maxLength) {
        slug += "-";
      }
      pendingSeparator = false;
      if (slug.length < maxLength) {
        slug += char;
      }
      continue;
    }

    pendingSeparator = slug.length > 0;
  }

  return trimTrailingHyphens(slug) || fallback;
}

function trimTrailingHyphens(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "-") {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function isLowerAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}

function isArtifactSegmentChar(char: string): boolean {
  return (
    (char >= "A" && char <= "Z") ||
    (char >= "a" && char <= "z") ||
    (char >= "0" && char <= "9") ||
    char === "." ||
    char === "_" ||
    char === "-"
  );
}
