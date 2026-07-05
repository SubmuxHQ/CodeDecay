import type { DesignMatcher } from "@submuxhq/codedecay-core";
import type { ContractFileContext } from "./types";

export function matchesMatcher(matcher: DesignMatcher, file: ContractFileContext): boolean {
  const hasFileMatcher = Boolean(matcher.files?.length);
  const hasAreaMatcher = Boolean(matcher.areas?.length);

  if (!hasFileMatcher && !hasAreaMatcher) {
    return true;
  }

  return (
    (matcher.files?.some((pattern) => matchesPathPattern(file.change.path, pattern)) ?? false) ||
    (matcher.areas?.some((area) => file.areaKinds.has(area)) ?? false)
  );
}

export function matchesPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

export function matchesImportPattern(specifier: string, pattern: string): boolean {
  return matchesPathPattern(specifier, pattern);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
