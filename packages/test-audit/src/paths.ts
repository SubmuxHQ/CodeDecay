import { isTestFilePath } from "@submuxhq/codedecay-core";
import type { FileChange } from "@submuxhq/codedecay-core";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);

export function isChangedSourceFile(change: FileChange): boolean {
  return change.status !== "deleted" && isSourcePath(change.path) && !isTestPath(change.path) && !isDocsPath(change.path);
}

export function isTestPath(path: string): boolean {
  return isTestFilePath(path);
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
