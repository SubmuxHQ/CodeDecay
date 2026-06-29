import type { FileChange } from "@submuxhq/codedecay-core";

const TEST_DIR_NAMES = new Set(["test", "tests", "spec", "specs", "e2e", "integration", "__tests__", "__specs__"]);
const TEST_FILE_STEM_PATTERN = /(^|[._-])(test|spec|e2e|integration)([._-]|$)/i;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);

export function isChangedSourceFile(change: FileChange): boolean {
  return change.status !== "deleted" && isSourcePath(change.path) && !isTestPath(change.path) && !isDocsPath(change.path);
}

export function isTestPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const directorySegments = segments.slice(0, -1);
  if (directorySegments.some((segment) => TEST_DIR_NAMES.has(segment))) {
    return true;
  }

  const fileName = segments.at(-1) ?? normalized;
  return TEST_FILE_STEM_PATTERN.test(stripExtension(fileName));
}

function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extensionOf(path));
}

function isDocsPath(path: string): boolean {
  return /(^|\/)(docs?|readme|changelog|license)(\/|\.|$)/i.test(path) || /\.(md|mdx|txt)$/i.test(path);
}

function extensionOf(path: string): string {
  const match = /\.[^.\/]+$/.exec(path);
  return match?.[0].toLowerCase() ?? "";
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}
