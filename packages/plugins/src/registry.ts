import type {
  CodeDecayPluginExtensionPoint,
  CodeDecayPluginManifest,
  PluginActivationOptions,
  PluginLimitation,
  PluginRegistrySnapshot
} from "./types";
import { validateNonEmptyString, validatePluginManifest } from "./validation";

export interface PluginRegistrationOptions {
  override?: boolean | undefined;
}

export interface CreateExplicitPluginRegistryOptions {
  availablePlugins?: CodeDecayPluginManifest[] | undefined;
  enabledPluginIds?: string[] | undefined;
  modelProvidersEnabled?: boolean | undefined;
}

export class CodeDecayPluginRegistry {
  private readonly availablePlugins = new Map<string, CodeDecayPluginManifest>();
  private readonly activePluginIds = new Set<string>();
  private readonly limitations: PluginLimitation[] = [];

  constructor(plugins: CodeDecayPluginManifest[] = []) {
    for (const plugin of plugins) {
      this.registerAvailable(plugin);
    }
  }

  registerAvailable(plugin: CodeDecayPluginManifest, options: PluginRegistrationOptions = {}): void {
    validatePluginManifest(plugin);

    if (this.availablePlugins.has(plugin.id) && !options.override) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }

    this.availablePlugins.set(plugin.id, clonePlugin(plugin));
  }

  activateExplicit(pluginIds: string[], options: PluginActivationOptions = {}): PluginRegistrySnapshot {
    this.activePluginIds.clear();
    this.limitations.splice(0);

    const seen = new Set<string>();
    for (const pluginId of pluginIds) {
      validateNonEmptyString(pluginId, "Plugin id");

      if (seen.has(pluginId)) {
        this.limitations.push({
          pluginId,
          severity: "warning",
          message: `Plugin ${pluginId} was listed more than once; later duplicates were ignored.`
        });
        continue;
      }
      seen.add(pluginId);

      const plugin = this.availablePlugins.get(pluginId);
      if (!plugin) {
        this.limitations.push({
          pluginId,
          severity: "error",
          message: `Configured plugin ${pluginId} is not registered locally.`
        });
        continue;
      }

      this.activePluginIds.add(pluginId);
      this.recordSafetyLimitations(plugin, options);
    }

    return this.snapshot();
  }

  getAvailable(id: string): CodeDecayPluginManifest | undefined {
    validateNonEmptyString(id, "Plugin id");
    const plugin = this.availablePlugins.get(id);
    return plugin ? clonePlugin(plugin) : undefined;
  }

  listAvailable(): CodeDecayPluginManifest[] {
    return [...this.availablePlugins.values()]
      .map(clonePlugin)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  listActive(): CodeDecayPluginManifest[] {
    return [...this.activePluginIds]
      .flatMap((id) => {
        const plugin = this.availablePlugins.get(id);
        return plugin ? [clonePlugin(plugin)] : [];
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  findActiveByExtensionPoint(extensionPoint: CodeDecayPluginExtensionPoint): CodeDecayPluginManifest[] {
    return this.listActive().filter((plugin) => plugin.extensionPoints.includes(extensionPoint));
  }

  snapshot(): PluginRegistrySnapshot {
    return {
      activePlugins: this.listActive(),
      limitations: this.limitations.map((limitation) => ({ ...limitation }))
    };
  }

  private recordSafetyLimitations(plugin: CodeDecayPluginManifest, options: PluginActivationOptions): void {
    if (plugin.safety?.requiresExecution) {
      this.limitations.push({
        pluginId: plugin.id,
        severity: "warning",
        message: `Plugin ${plugin.id} declares command execution; CodeDecay commands must still run through packages/execution.`
      });
    }

    if (plugin.safety?.requiresModelProvider && !options.modelProvidersEnabled) {
      this.limitations.push({
        pluginId: plugin.id,
        severity: "warning",
        message: `Plugin ${plugin.id} declares model-provider usage; model calls require explicit LLM/agent provider config.`
      });
    }
  }
}

export function createPluginRegistry(plugins: CodeDecayPluginManifest[] = []): CodeDecayPluginRegistry {
  return new CodeDecayPluginRegistry(plugins);
}

export function createExplicitPluginRegistry(options: CreateExplicitPluginRegistryOptions = {}): CodeDecayPluginRegistry {
  const registry = new CodeDecayPluginRegistry(options.availablePlugins ?? []);
  registry.activateExplicit(options.enabledPluginIds ?? [], {
    modelProvidersEnabled: options.modelProvidersEnabled
  });
  return registry;
}

function clonePlugin(plugin: CodeDecayPluginManifest): CodeDecayPluginManifest {
  return {
    ...plugin,
    extensionPoints: [...plugin.extensionPoints],
    safety: plugin.safety
      ? {
          ...plugin.safety,
          notes: plugin.safety.notes ? [...plugin.safety.notes] : undefined
        }
      : undefined
  };
}
