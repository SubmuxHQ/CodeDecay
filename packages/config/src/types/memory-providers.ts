export type CodeDecayMemoryProviderId = "local" | "mem0" | "supermemory";

export interface CodeDecayLocalMemoryProviderConfig {
  provider: "local";
  enabled: boolean;
}

export interface CodeDecayExternalMemoryProviderConfig {
  provider: "mem0" | "supermemory";
  enabled: boolean;
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  projectId?: string | undefined;
  collection?: string | undefined;
}

export type CodeDecayMemoryProviderConfig =
  | CodeDecayLocalMemoryProviderConfig
  | CodeDecayExternalMemoryProviderConfig;

export interface CodeDecayMemoryProvidersConfig {
  providers: CodeDecayMemoryProviderConfig[];
}
