import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import type {
  CodeDecayExternalMemoryProviderConfig,
  CodeDecayMemoryProviderConfig,
  CodeDecayMemoryProviderId,
  CodeDecayMemoryProvidersConfig
} from "../types";
import {
  isPlainObject,
  normalizeBoolean,
  normalizeEnvironmentVariableName,
  normalizeNonEmptyString,
  normalizeUrlString
} from "./primitives";

const SUPPORTED_MEMORY_PROVIDERS = new Set<CodeDecayMemoryProviderId>(["local", "mem0", "supermemory"]);

export function normalizeMemoryProviders(value: unknown, sourcePath: string): CodeDecayMemoryProvidersConfig {
  if (value === undefined) {
    return cloneMemoryProviders(DEFAULT_CODEDECAY_CONFIG.memoryProviders);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: memoryProviders must be an object.`);
  }

  const providers = value.providers === undefined
    ? DEFAULT_CODEDECAY_CONFIG.memoryProviders.providers
    : normalizeProviderList(value.providers, sourcePath);

  return {
    providers: ensureUniqueProviders(providers, sourcePath)
  };
}

export function cloneMemoryProviders(config: CodeDecayMemoryProvidersConfig): CodeDecayMemoryProvidersConfig {
  return {
    providers: config.providers.map((provider) => ({ ...provider }))
  };
}

function normalizeProviderList(value: unknown, sourcePath: string): CodeDecayMemoryProviderConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: memoryProviders.providers must be a non-empty array.`);
  }

  return value.map((item, index) => normalizeProvider(item, `memoryProviders.providers[${index}]`, sourcePath));
}

function normalizeProvider(
  value: unknown,
  field: string,
  sourcePath: string
): CodeDecayMemoryProviderConfig {
  if (typeof value === "string") {
    return normalizeProvider({ provider: value }, field, sourcePath);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a provider id or object.`);
  }

  const provider = normalizeProviderId(value.provider, `${field}.provider`, sourcePath);
  const enabled = value.enabled === undefined ? true : normalizeBoolean(value.enabled, `${field}.enabled`, sourcePath);

  if (provider === "local") {
    return {
      provider,
      enabled
    };
  }

  const config: CodeDecayExternalMemoryProviderConfig = {
    provider,
    enabled
  };

  if (value.endpoint !== undefined) {
    config.endpoint = normalizeUrlString(value.endpoint, `${field}.endpoint`, sourcePath);
  }

  if (value.apiKeyEnv !== undefined) {
    config.apiKeyEnv = normalizeEnvironmentVariableName(value.apiKeyEnv, `${field}.apiKeyEnv`, sourcePath);
  }

  if (value.projectId !== undefined) {
    config.projectId = normalizeNonEmptyString(value.projectId, `${field}.projectId`, sourcePath);
  }

  if (value.collection !== undefined) {
    config.collection = normalizeNonEmptyString(value.collection, `${field}.collection`, sourcePath);
  }

  return config;
}

function normalizeProviderId(value: unknown, field: string, sourcePath: string): CodeDecayMemoryProviderId {
  const provider = normalizeNonEmptyString(value, field, sourcePath);
  if (SUPPORTED_MEMORY_PROVIDERS.has(provider as CodeDecayMemoryProviderId)) {
    return provider as CodeDecayMemoryProviderId;
  }

  throw new Error(
    `Invalid CodeDecay config at ${sourcePath}: ${field} must be local, mem0, or supermemory.`
  );
}

function ensureUniqueProviders(
  providers: CodeDecayMemoryProviderConfig[],
  sourcePath: string
): CodeDecayMemoryProviderConfig[] {
  const seen = new Set<string>();

  for (const provider of providers) {
    if (seen.has(provider.provider)) {
      throw new Error(
        `Invalid CodeDecay config at ${sourcePath}: memoryProviders.providers contains duplicate provider ${provider.provider}.`
      );
    }
    seen.add(provider.provider);
  }

  return providers;
}
