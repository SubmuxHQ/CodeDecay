import { basename, extname } from "node:path";
import {
  ASSET_EXTENSIONS,
  SOURCE_EXTENSIONS,
  TEST_DIR_NAMES,
  TEST_FILE_STEM_PATTERN
} from "./path-constants";
import { normalizePath, stripExtension } from "./path-utils";

export function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function isAssetPath(path: string): boolean {
  return ASSET_EXTENSIONS.has(extname(path).toLowerCase());
}

export function isDocsPath(path: string): boolean {
  return /(^|\/)(docs?|readme|changelog|adr)(\/|\.|$)/i.test(path) || /\.(md|mdx|txt)$/i.test(path);
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
