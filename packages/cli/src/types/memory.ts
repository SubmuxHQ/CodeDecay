import type { ConfigFormat } from "./common";

export interface MemoryOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
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
