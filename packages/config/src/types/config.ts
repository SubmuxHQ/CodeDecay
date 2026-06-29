import type { CodeDecayCommands, CodeDecayProbe } from "./commands";
import type { CodeDecayLlmConfig } from "./llm";
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
  toolAdapters: CodeDecayToolAdapters;
  productTesting: CodeDecayProductTestingConfig;
  plugins: CodeDecayPluginsConfig;
}
