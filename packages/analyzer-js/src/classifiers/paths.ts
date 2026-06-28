import { basename, extname } from "node:path";
import type { FileChange, ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";

export type AreaKind = ImpactedArea["kind"];

export interface PathClassification {
  kind: AreaKind;
  name: string;
  risk: RiskLevel;
}

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);
const ASSET_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2"
]);
const TEST_DIR_NAMES = new Set(["test", "tests", "spec", "specs", "e2e", "integration", "__tests__", "__specs__"]);
const TEST_FILE_STEM_PATTERN = /(^|[._-])(test|spec|e2e|integration)([._-]|$)/i;
const PACKAGE_METADATA_KEYS = new Set([
  "author",
  "bugs",
  "description",
  "funding",
  "homepage",
  "keywords",
  "license",
  "name",
  "private",
  "repository",
  "version"
]);

export function classifyChange(change: FileChange): PathClassification | undefined {
  if (isLockfilePath(change.path)) {
    return { kind: "config", name: "Dependency lockfile", risk: "low" };
  }

  if (isPackageMetadataOnlyChange(change)) {
    return { kind: "config", name: "Package metadata", risk: "low" };
  }

  return classifyPath(change.path);
}

export function classifyPath(path: string): PathClassification | undefined {
  const normalized = path.toLowerCase();

  if (isAssetPath(normalized)) {
    return undefined;
  }

  if (isDocsPath(normalized)) {
    return { kind: "docs", name: "Documentation", risk: "low" };
  }

  if (isTestPath(normalized)) {
    return { kind: "test", name: "Tests", risk: "low" };
  }

  if (/(^|\/)(auth|session|sessions|jwt|oauth|middleware|permissions?|rbac|acl)(\/|\.|-|_)/i.test(path)) {
    return { kind: "auth", name: "Authentication and authorization", risk: "high" };
  }

  if (
    /(^|\/)(schema\.prisma|migrations?|drizzle|knex|sequelize|typeorm|db|database|models?)(\/|\.|-|_|$)/i.test(path)
  ) {
    return { kind: "database", name: "Database and schema", risk: "high" };
  }

  if (/(^|\/)(pages\/api|app\/api|api|routes?|controllers?)(\/|\.|-|_)/i.test(path)) {
    return { kind: "api", name: "API surface", risk: "high" };
  }

  if (/(^|\/)(app|pages|routes|screens|views)(\/|\.|-|_)/i.test(path) && isSourcePath(path)) {
    return { kind: "ui", name: "UI route", risk: "medium" };
  }

  if (
    /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|tsconfig|next\.config|vite\.config|webpack\.config|eslint|prettier|dockerfile|compose|\.github\/workflows|vercel\.json|netlify\.toml)/i.test(
      path
    )
  ) {
    return { kind: "config", name: "Build and runtime configuration", risk: "medium" };
  }

  if (isSourcePath(path)) {
    return { kind: "source", name: "Source code", risk: "low" };
  }

  return undefined;
}

export function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function isAssetPath(path: string): boolean {
  return ASSET_EXTENSIONS.has(extname(path).toLowerCase());
}

export function isDocsPath(path: string): boolean {
  return /(^|\/)(docs?|readme|changelog|adr)(\/|\.|$)/i.test(path) || /\.(md|mdx|txt)$/i.test(path);
}

export function isLowSignalChange(change: FileChange): boolean {
  return (
    isDocsPath(change.path) ||
    isAssetPath(change.path) ||
    isLockfilePath(change.path) ||
    isPackageMetadataOnlyChange(change)
  );
}

export function isLockfilePath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const fileName = basename(normalized);
  return (
    fileName === "pnpm-lock.yaml" ||
    fileName === "yarn.lock" ||
    fileName === "package-lock.json" ||
    fileName === "npm-shrinkwrap.json" ||
    fileName === "bun.lock" ||
    fileName === "bun.lockb"
  );
}

export function isPackageMetadataOnlyChange(change: FileChange): boolean {
  if (basename(normalizePath(change.path)).toLowerCase() !== "package.json") {
    return false;
  }

  const meaningfulLines = change.addedLines
    .map((line) => line.content.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));

  if (meaningfulLines.length === 0) {
    return true;
  }

  return meaningfulLines.every((line) => {
    if (/^[{}\[\],]+$/.test(line)) {
      return true;
    }

    const keyMatch = /^"([^"]+)"\s*:/.exec(line);
    if (keyMatch) {
      return PACKAGE_METADATA_KEYS.has(keyMatch[1] ?? "");
    }

    return /^"[^"]+"\s*,?$/.test(line) || /^(true|false|null)\s*,?$/.test(line);
  });
}

export function isTestPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const directorySegments = segments.slice(0, -1);
  if (directorySegments.some((segment) => TEST_DIR_NAMES.has(segment))) {
    return true;
  }

  const fileName = segments.at(-1) ?? normalized;
  return TEST_FILE_STEM_PATTERN.test(stripExtension(fileName));
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
