import type { ConfigFormat } from "./common";

export interface MemoryOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
}

export type MemorySetupProvider = "local" | "mem0" | "supermemory" | "all";

export interface MemorySetupOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  provider: MemorySetupProvider;
  apply: boolean;
}

export interface MemoryImportOptions {
  cwd?: string | undefined;
  input: string;
  format: ConfigFormat;
  apply: boolean;
}

export interface MemoryLearnOptions {
  cwd?: string | undefined;
  input: string;
  format: ConfigFormat;
  apply: boolean;
}
