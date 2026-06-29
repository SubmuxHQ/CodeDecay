import { cloneProductTesting } from "../clone";
import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import type {
  CodeDecayProductTarget,
  CodeDecayProductTestingConfig,
  CodeDecaySafety
} from "../types";
import { normalizeProductTarget } from "./product/target";
import { isPlainObject } from "./primitives";

export function normalizeProductTesting(
  value: unknown,
  safety: CodeDecaySafety,
  sourcePath: string
): CodeDecayProductTestingConfig {
  if (value === undefined) {
    return cloneProductTesting(DEFAULT_CODEDECAY_CONFIG.productTesting);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: productTesting must be an object.`);
  }

  if (value.targets === undefined) {
    return {
      targets: {}
    };
  }

  if (!isPlainObject(value.targets)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: productTesting.targets must be an object.`);
  }

  const targets: Record<string, CodeDecayProductTarget> = {};
  for (const id of Object.keys(value.targets).sort((left, right) => left.localeCompare(right))) {
    if (id.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: productTesting.targets contains an empty target id.`);
    }

    targets[id] = normalizeProductTarget(id, value.targets[id], safety, sourcePath);
  }

  return {
    targets
  };
}
