import { dedupeStrings } from "../collections";
import { compareRiskLevels } from "../risk";
import type { ProductFailureBundle } from "../types";

export function sortProductFailureBundles(bundles: ProductFailureBundle[]): ProductFailureBundle[] {
  return [...bundles]
    .map((bundle) => ({
      ...bundle,
      neighboringSteps: [...bundle.neighboringSteps].sort((left, right) => left.index - right.index),
      artifacts: [...bundle.artifacts].sort((left, right) =>
        `${left.kind}:${left.path ?? ""}:${left.label ?? ""}`.localeCompare(`${right.kind}:${right.path ?? ""}:${right.label ?? ""}`)
      ),
      classificationEvidence:
        bundle.classificationEvidence && bundle.classificationEvidence.length > 0
          ? dedupeStrings(bundle.classificationEvidence)
          : undefined,
      impactedFiles: dedupeStrings(bundle.impactedFiles),
      suggestedFixTasks: dedupeStrings(bundle.suggestedFixTasks)
    }))
    .sort((left, right) => {
      const risk = compareRiskLevels(right.priority, left.priority);
      if (risk !== 0) {
        return risk;
      }

      return left.id.localeCompare(right.id);
    });
}
