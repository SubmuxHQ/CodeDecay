import { basename, extname } from "node:path";
import { isTestFilePath } from "@submuxhq/codedecay-core";
import { ASSET_EXTENSIONS, SOURCE_EXTENSIONS } from "./path-constants";
import { normalizePath } from "./path-utils";

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
  return isTestFilePath(path);
}
