import type { RuntimeCoverageSourceKind } from "@submuxhq/codedecay-core";
import { normalizePath } from "../utils";

export function detectCoverageArtifactKind(absolutePath: string): RuntimeCoverageSourceKind | undefined {
  const normalized = normalizePath(absolutePath).toLowerCase();
  if (normalized.endsWith("/coverage-final.json") || normalized.endsWith("coverage-final.json")) {
    return "istanbul";
  }

  if (normalized.endsWith("/lcov.info") || normalized.endsWith("lcov.info")) {
    return "lcov";
  }

  if (normalized.endsWith(".json")) {
    return "v8";
  }

  return undefined;
}
