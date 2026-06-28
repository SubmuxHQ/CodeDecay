import type { ProductGeneratedTestCase } from "../../types";
import { escapeRegExp } from "./strings";

export function priorityForPath(path: string, impactedPaths: Set<string>): ProductGeneratedTestCase["priority"] {
  const normalized = normalizeProductPriorityPath(path);
  return [...impactedPaths].some((candidate) => productPriorityPathMatches(normalized, candidate)) ? "high" : "medium";
}

export function normalizeProductPriorityPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }

  try {
    const url = new URL(trimmed);
    return normalizeProductPriorityPath(url.pathname);
  } catch {
    const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
    if (pathOnly === "/") {
      return "/";
    }

    return pathOnly.replace(/\/+$/, "") || "/";
  }
}

export function priorityRank(priority: ProductGeneratedTestCase["priority"]): number {
  if (priority === "high") {
    return 0;
  }

  if (priority === "medium") {
    return 1;
  }

  return 2;
}

function productPriorityPathMatches(path: string, candidate: string): boolean {
  if (path === candidate) {
    return true;
  }

  return productPriorityPathPattern(path).test(candidate) || productPriorityPathPattern(candidate).test(path);
}

function productPriorityPathPattern(path: string): RegExp {
  const segments = normalizeProductPriorityPath(path)
    .split("/")
    .map((segment) => {
      if (/^[:{][^/{}:]+}?$/.test(segment)) {
        return "[^/]+";
      }

      return escapeRegExp(segment);
    });

  return new RegExp(`^${segments.join("/")}$`);
}
