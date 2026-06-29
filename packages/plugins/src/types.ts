export const CODEDECAY_PLUGIN_EXTENSION_POINTS = [
  "matcher",
  "language-parser",
  "analyzer",
  "agent-provider",
  "tool-adapter",
  "memory-provider",
  "ownership",
  "notifier"
] as const;

export type CodeDecayPluginExtensionPoint = typeof CODEDECAY_PLUGIN_EXTENSION_POINTS[number];

export interface CodeDecayPluginSafety {
  requiresExecution?: boolean | undefined;
  requiresModelProvider?: boolean | undefined;
  notes?: string[] | undefined;
}

export interface CodeDecayPluginManifest {
  id: string;
  name: string;
  version?: string | undefined;
  description?: string | undefined;
  extensionPoints: CodeDecayPluginExtensionPoint[];
  safety?: CodeDecayPluginSafety | undefined;
}

export type PluginLimitationSeverity = "warning" | "error";

export interface PluginLimitation {
  pluginId?: string | undefined;
  severity: PluginLimitationSeverity;
  message: string;
}

export interface PluginActivationOptions {
  modelProvidersEnabled?: boolean | undefined;
}

export interface PluginRegistrySnapshot {
  activePlugins: CodeDecayPluginManifest[];
  limitations: PluginLimitation[];
}
