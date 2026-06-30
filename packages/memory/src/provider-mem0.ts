import type { ImpactedArea } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory, LoadedCodeDecayMemory, MemoryProvider } from "./types";

type Mem0Module = {
  MemoryClient?: new (options: { apiKey: string; host?: string | undefined }) => Mem0Client;
  default?: new (options: { apiKey: string; host?: string | undefined }) => Mem0Client;
};

type Mem0Client = {
  search(query: string, options?: Record<string, unknown>): Promise<unknown>;
};

export interface Mem0MemoryProviderOptions {
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  query?: string | undefined;
  topK?: number | undefined;
  projectId?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  importModule?: ((specifier: string) => Promise<Mem0Module>) | undefined;
}

export function createMem0MemoryProvider(options: Mem0MemoryProviderOptions = {}): MemoryProvider {
  return {
    id: "mem0",
    name: "Mem0",
    kind: "external",
    async load(): Promise<LoadedCodeDecayMemory> {
      const apiKeyEnv = options.apiKeyEnv ?? "MEM0_API_KEY";
      const apiKey = (options.env ?? process.env)[apiKeyEnv];
      if (!apiKey) {
        throw new Error(`Mem0 memory provider requires API key environment variable ${apiKeyEnv}.`);
      }

      const module = await loadMem0Module(options.importModule);
      const Client = module.MemoryClient ?? module.default;
      if (!Client) {
        throw new Error("Mem0 memory provider could not find MemoryClient export from mem0ai.");
      }

      const clientOptions: { apiKey: string; host?: string | undefined } = { apiKey };
      if (options.endpoint) {
        clientOptions.host = options.endpoint;
      }

      const client = new Client(clientOptions);
      const payload = await client.search(options.query ?? "CodeDecay project memory", {
        topK: options.topK ?? 20,
        filters: options.projectId ? { projectId: options.projectId } : undefined
      });

      return {
        memory: normalizeMem0Payload(payload),
        sourcePath: options.endpoint ? `mem0:${options.endpoint}` : "mem0"
      };
    }
  };
}

async function loadMem0Module(importModule?: (specifier: string) => Promise<Mem0Module>): Promise<Mem0Module> {
  const importer = importModule ?? ((specifier: string) => import(specifier) as Promise<Mem0Module>);
  try {
    return await importer("mem0ai");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Mem0 memory provider requires the optional mem0ai package to be installed in the project. ${message}`
    );
  }
}

function normalizeMem0Payload(payload: unknown): CodeDecayMemory {
  const memory: CodeDecayMemory = {
    version: 1,
    flows: [],
    commands: [],
    invariants: [],
    architecture: [],
    regressions: []
  };

  for (const item of extractMem0Items(payload)) {
    const text = readText(item);
    if (!text) {
      continue;
    }

    const metadata = readMetadata(item);
    const codedecay = readObject(metadata.codedecay);
    const type = readString(codedecay.type) ?? readString(metadata.codedecayType);

    if (type === "flow") {
      memory.flows.push({
        name: readString(codedecay.name) ?? titleFromText(text),
        description: text,
        files: readStringArray(codedecay.files),
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
          files: readStringArray(codedecay.files),
          areas: readAreaArray(codedecay.areas)
        });
      }
      continue;
    }

    if (type === "invariant") {
      memory.invariants.push({
        name: readString(codedecay.name) ?? titleFromText(text),
        description: text,
        files: readStringArray(codedecay.files),
        areas: readAreaArray(codedecay.areas)
      });
      continue;
    }

    if (type === "regression") {
      memory.regressions.push({
        title: readString(codedecay.title) ?? titleFromText(text),
        description: text,
        check: readString(codedecay.check),
        files: readStringArray(codedecay.files),
        areas: readAreaArray(codedecay.areas)
      });
      continue;
    }

    memory.architecture.push({
      title: readString(codedecay.title) ?? titleFromText(text),
      note: text,
      files: readStringArray(codedecay.files),
      areas: readAreaArray(codedecay.areas)
    });
  }

  return memory;
}

function extractMem0Items(payload: unknown): Record<string, unknown>[] {
  const object = readObject(payload);
  const results = Array.isArray(object.results) ? object.results : Array.isArray(payload) ? payload : [];
  return results.map(readObject).filter((item) => Object.keys(item).length > 0);
}

function readText(item: Record<string, unknown>): string | undefined {
  return readString(item.memory) ?? readString(readObject(item.data).memory) ?? readString(item.text);
}

function readMetadata(item: Record<string, unknown>): Record<string, unknown> {
  return readObject(item.metadata);
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
  return text.split(/[.\n]/)[0]?.slice(0, 80) || "Mem0 memory";
}
