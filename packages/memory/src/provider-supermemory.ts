import type { ImpactedArea } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory, LoadedCodeDecayMemory, MemoryProvider } from "./types";

type SupermemoryModule = {
  Supermemory?: new (options: SupermemoryClientOptions) => SupermemoryClient;
  default?: new (options: SupermemoryClientOptions) => SupermemoryClient;
};

type SupermemoryClientOptions = {
  apiKey: string;
  baseURL?: string | null | undefined;
};

type SupermemoryClient = {
  search: {
    memories(body: SupermemorySearchParams): Promise<unknown>;
  };
};

type SupermemorySearchParams = {
  q: string;
  limit?: number | undefined;
  containerTag?: string | undefined;
};

export interface SupermemoryMemoryProviderOptions {
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  query?: string | undefined;
  topK?: number | undefined;
  projectId?: string | undefined;
  collection?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  importModule?: ((specifier: string) => Promise<SupermemoryModule>) | undefined;
}

export function createSupermemoryMemoryProvider(options: SupermemoryMemoryProviderOptions = {}): MemoryProvider {
  return {
    id: "supermemory",
    name: "Supermemory",
    kind: "external",
    async load(): Promise<LoadedCodeDecayMemory> {
      const apiKeyEnv = options.apiKeyEnv ?? "SUPERMEMORY_API_KEY";
      const apiKey = (options.env ?? process.env)[apiKeyEnv];
      if (!apiKey) {
        throw new Error(`Supermemory provider requires API key environment variable ${apiKeyEnv}.`);
      }

      const module = await loadSupermemoryModule(options.importModule);
      const Client = module.Supermemory ?? module.default;
      if (!Client) {
        throw new Error("Supermemory provider could not find Supermemory export from supermemory.");
      }

      const clientOptions: SupermemoryClientOptions = { apiKey };
      if (options.endpoint) {
        clientOptions.baseURL = options.endpoint;
      }

      const client = new Client(clientOptions);
      const searchParams: SupermemorySearchParams = {
        q: options.query ?? "CodeDecay project memory",
        limit: options.topK ?? 20
      };
      const containerTag = options.collection ?? options.projectId;
      if (containerTag) {
        searchParams.containerTag = containerTag;
      }

      const payload = await client.search.memories(searchParams);

      return {
        memory: normalizeSupermemoryPayload(payload),
        sourcePath: options.endpoint ? `supermemory:${options.endpoint}` : "supermemory"
      };
    }
  };
}

async function loadSupermemoryModule(
  importModule?: (specifier: string) => Promise<SupermemoryModule>
): Promise<SupermemoryModule> {
  const importer = importModule ?? ((specifier: string) => import(specifier) as Promise<SupermemoryModule>);
  try {
    return await importer("supermemory");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Supermemory provider requires the optional supermemory package to be installed in the project. ${message}`
    );
  }
}

function normalizeSupermemoryPayload(payload: unknown): CodeDecayMemory {
  const memory: CodeDecayMemory = {
    version: 1,
    flows: [],
    commands: [],
    invariants: [],
    architecture: [],
    regressions: []
  };

  for (const item of extractSupermemoryItems(payload)) {
    const text = readText(item);
    if (!text) {
      continue;
    }

    const metadata = readMetadata(item);
    const codedecay = readObject(metadata.codedecay);
    const files = readFiles(codedecay, item);
    const type = readString(codedecay.type) ?? readString(metadata.codedecayType);

    if (type === "flow") {
      memory.flows.push({
        name: readString(codedecay.name) ?? titleFromText(text),
        description: text,
        files,
        areas: readAreaArray(codedecay.areas)
      });
      continue;
    }

    if (type === "command") {
      const command = readString(codedecay.command);
      if (command) {
        memory.commands.push({
          name: readString(codedecay.name) ?? titleFromText(text),
          command,
          description: text,
          files,
          areas: readAreaArray(codedecay.areas)
        });
      }
      continue;
    }

    if (type === "invariant") {
      memory.invariants.push({
        name: readString(codedecay.name) ?? titleFromText(text),
        description: text,
        files,
        areas: readAreaArray(codedecay.areas)
      });
      continue;
    }

    if (type === "regression") {
      memory.regressions.push({
        title: readString(codedecay.title) ?? titleFromText(text),
        description: text,
        check: readString(codedecay.check),
        files,
        areas: readAreaArray(codedecay.areas)
      });
      continue;
    }

    memory.architecture.push({
      title: readString(codedecay.title) ?? titleFromText(text),
      note: text,
      files,
      areas: readAreaArray(codedecay.areas)
    });
  }

  return memory;
}

function extractSupermemoryItems(payload: unknown): Record<string, unknown>[] {
  const object = readObject(payload);
  const results = Array.isArray(object.results) ? object.results : Array.isArray(payload) ? payload : [];
  return results.map(readObject).filter((item) => Object.keys(item).length > 0);
}

function readText(item: Record<string, unknown>): string | undefined {
  return readString(item.memory)
    ?? readString(item.chunk)
    ?? readString(item.content)
    ?? readString(item.summary)
    ?? readChunkText(item.chunks);
}

function readChunkText(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const chunk of value) {
    const content = readString(readObject(chunk).content);
    if (content) {
      return content;
    }
  }

  return undefined;
}

function readMetadata(item: Record<string, unknown>): Record<string, unknown> {
  return readObject(item.metadata);
}

function readFiles(codedecay: Record<string, unknown>, item: Record<string, unknown>): string[] | undefined {
  return readStringArray(codedecay.files) ?? readSingleFile(item.filepath);
}

function readSingleFile(value: unknown): string[] | undefined {
  const path = readString(value);
  return path ? [path] : undefined;
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function readAreaArray(value: unknown): ImpactedArea["kind"][] | undefined {
  return readStringArray(value) as ImpactedArea["kind"][] | undefined;
}

function titleFromText(text: string): string {
  return text.split(/[.\n]/)[0]?.slice(0, 80) || "Supermemory memory";
}
