import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import type { CodeDecayPluginsConfig } from "../types";
import { isPlainObject, normalizeStringList } from "./primitives";

export function normalizePlugins(value: unknown, sourcePath: string): CodeDecayPluginsConfig {
  if (value === undefined) {
    return {
      enabled: [...DEFAULT_CODEDECAY_CONFIG.plugins.enabled]
    };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: plugins must be an object.`);
  }

  return {
    enabled: value.enabled === undefined ? [] : normalizeStringList(value.enabled, "plugins.enabled", sourcePath)
  };
}
