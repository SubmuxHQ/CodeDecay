import type {
  CodeDecayExternalMemoryProviderConfig,
  CodeDecayMemoryProvidersConfig
} from "@submuxhq/codedecay-config";
import type { RedteamMemoryProviderSource } from "@submuxhq/codedecay-redteam";
import {
  createMem0MemoryProvider,
  createSupermemoryMemoryProvider,
  importCodeDecayMemory,
  loadCodeDecayMemoryFromProviderAsync,
  type CodeDecayMemory,
  type LoadedCodeDecayMemory,
  type MemoryProvider
} from "@submuxhq/codedecay-memory";

export interface RedteamMemoryContext {
  memory: CodeDecayMemory;
  sourcePath?: string | undefined;
  providerSources: RedteamMemoryProviderSource[];
}

export interface MemoryProviderFactories {
  mem0?(config: CodeDecayExternalMemoryProviderConfig): MemoryProvider;
  supermemory?(config: CodeDecayExternalMemoryProviderConfig): MemoryProvider;
}

export async function loadConfiguredRedteamMemory(input: {
  rootDir: string;
  localMemory: LoadedCodeDecayMemory;
  memoryProviders: CodeDecayMemoryProvidersConfig;
  providerFactories?: MemoryProviderFactories | undefined;
}): Promise<RedteamMemoryContext> {
  let memory = input.localMemory.memory;
  const providerSources: RedteamMemoryProviderSource[] = [
    {
      provider: "local",
      kind: "local",
      status: "loaded",
      sourcePath: input.localMemory.sourcePath,
      untrusted: true
    }
  ];

  for (const providerConfig of input.memoryProviders.providers) {
    if (providerConfig.provider === "local" || !providerConfig.enabled) {
      continue;
    }

    const source = await loadExternalMemoryProvider({
      rootDir: input.rootDir,
      providerConfig,
      providerFactories: input.providerFactories
    });
    providerSources.push(source.summary);

    if (source.loaded) {
      memory = importCodeDecayMemory(memory, source.loaded.memory, source.loaded.sourcePath ?? source.summary.provider).memory;
    }
  }

  return {
    memory,
    sourcePath: summarizeSourcePaths(providerSources),
    providerSources
  };
}

async function loadExternalMemoryProvider(input: {
  rootDir: string;
  providerConfig: CodeDecayExternalMemoryProviderConfig;
  providerFactories?: MemoryProviderFactories | undefined;
}): Promise<{
  summary: RedteamMemoryProviderSource;
  loaded?: LoadedCodeDecayMemory | undefined;
}> {
  try {
    const provider = createProvider(input.providerConfig, input.providerFactories);
    const loaded = await loadCodeDecayMemoryFromProviderAsync(provider, { rootDir: input.rootDir });
    return {
      loaded,
      summary: {
        provider: input.providerConfig.provider,
        kind: "external",
        status: "loaded",
        sourcePath: loaded.sourcePath,
        untrusted: true
      }
    };
  } catch (error: unknown) {
    return {
      summary: {
        provider: input.providerConfig.provider,
        kind: "external",
        status: "failed",
        error: formatProviderError(error),
        untrusted: true
      }
    };
  }
}

function createProvider(
  config: CodeDecayExternalMemoryProviderConfig,
  providerFactories: MemoryProviderFactories | undefined
): MemoryProvider {
  if (config.provider === "mem0") {
    return providerFactories?.mem0?.(config) ?? createMem0MemoryProvider({
      endpoint: config.endpoint,
      apiKeyEnv: config.apiKeyEnv,
      projectId: config.projectId
    });
  }

  return providerFactories?.supermemory?.(config) ?? createSupermemoryMemoryProvider({
    endpoint: config.endpoint,
    apiKeyEnv: config.apiKeyEnv,
    projectId: config.projectId,
    collection: config.collection
  });
}

function summarizeSourcePaths(sources: RedteamMemoryProviderSource[]): string | undefined {
  const loadedSources = sources
    .filter((source) => source.status === "loaded")
    .map((source) => source.sourcePath ?? (source.kind === "external" ? source.provider : undefined))
    .filter((sourcePath): sourcePath is string => sourcePath !== undefined);

  return loadedSources.length > 0 ? loadedSources.join(", ") : undefined;
}

function formatProviderError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
