import type { DesignContract } from "@submuxhq/codedecay-core";
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
  plugins: CodeDecayPluginsConfig;
  designContract?: DesignContract | undefined;
}
