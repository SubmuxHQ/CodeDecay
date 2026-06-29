import { DEFAULT_PRODUCT_TARGET_TIMEOUT_MS } from "../../defaults";
import type {
  CodeDecayProductTarget,
  CodeDecaySafety
} from "../../types";
import {
  isPlainObject,
  normalizeEnvironmentVariableName,
  normalizeNonEmptyString,
  normalizePositiveInteger,
  normalizeUrlString
} from "../primitives";
import { normalizeProductApiEndpoints } from "./api";
import { createProductTargetReadiness } from "./readiness";

export function normalizeProductTarget(
  id: string,
  value: unknown,
  safety: CodeDecaySafety,
  sourcePath: string
): CodeDecayProductTarget {
  const field = `productTesting.targets.${id}`;
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  const target: Omit<CodeDecayProductTarget, "readiness"> = {
    id,
    apiEndpoints: normalizeProductApiEndpoints(value.apiEndpoints, `${field}.apiEndpoints`, sourcePath),
    timeoutMs:
      value.timeoutMs === undefined
        ? DEFAULT_PRODUCT_TARGET_TIMEOUT_MS
        : normalizePositiveInteger(value.timeoutMs, `${field}.timeoutMs`, sourcePath)
  };

  if (value.baseUrl !== undefined) {
    target.baseUrl = normalizeUrlString(value.baseUrl, `${field}.baseUrl`, sourcePath);
  }

  if (value.startCommand !== undefined) {
    target.startCommand = normalizeNonEmptyString(value.startCommand, `${field}.startCommand`, sourcePath);
  }

  if (value.healthCheck !== undefined) {
    target.healthCheck = normalizeUrlString(value.healthCheck, `${field}.healthCheck`, sourcePath);
  }

  if (value.authSetupCommand !== undefined) {
    target.authSetupCommand = normalizeNonEmptyString(value.authSetupCommand, `${field}.authSetupCommand`, sourcePath);
  }

  if (value.teardownCommand !== undefined) {
    target.teardownCommand = normalizeNonEmptyString(value.teardownCommand, `${field}.teardownCommand`, sourcePath);
  }

  if (value.previewUrlEnv !== undefined) {
    target.previewUrlEnv = normalizeEnvironmentVariableName(value.previewUrlEnv, `${field}.previewUrlEnv`, sourcePath);
  }

  return {
    ...target,
    readiness: createProductTargetReadiness(target, safety)
  };
}
