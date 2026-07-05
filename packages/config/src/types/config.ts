import type { DesignContract } from "@submuxhq/codedecay-core";
import type { CodeDecayApiContractsConfig } from "./api-contracts";
import type { CodeDecayCommands, CodeDecayProbe } from "./commands";
import type { CodeDecayLlmConfig } from "./llm";
import type { CodeDecayMemoryProvidersConfig } from "./memory-providers";
import type { CodeDecayPluginsConfig } from "./plugins";
import type { CodeDecayProductTestingConfig } from "./product";
import type { CodeDecaySafety } from "./safety";
import type { CodeDecayToolAdapters } from "./tool-adapters";

export interface CodeDecayConfig {
  version: 1;
  commands: CodeDecayCommands;
  probes: CodeDecayProbe[];
  safety: CodeDecaySafety;
  llm: CodeDecayLlmConfig;
  memoryProviders: CodeDecayMemoryProvidersConfig;
  toolAdapters: CodeDecayToolAdapters;
  productTesting: CodeDecayProductTestingConfig;
  apiContracts: CodeDecayApiContractsConfig;
  plugins: CodeDecayPluginsConfig;
  designContract?: DesignContract | undefined;
}
