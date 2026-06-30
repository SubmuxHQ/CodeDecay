import type { CodeDecayConfig } from "./config";

export interface LoadedCodeDecayConfig {
  config: CodeDecayConfig;
  sourcePath?: string | undefined;
  designContractSourcePath?: string | undefined;
}

export interface LoadCodeDecayConfigOptions {
  cwd: string;
}
