import {
  CODEDECAY_PLUGIN_EXTENSION_POINTS,
  type CodeDecayPluginExtensionPoint,
  type CodeDecayPluginManifest
} from "./types";

const EXTENSION_POINTS = new Set<string>(CODEDECAY_PLUGIN_EXTENSION_POINTS);

export function validatePluginManifest(plugin: CodeDecayPluginManifest): void {
  validateNonEmptyString(plugin.id, "Plugin id");
  validateNonEmptyString(plugin.name, "Plugin name");

  if (!Array.isArray(plugin.extensionPoints) || plugin.extensionPoints.length === 0) {
    throw new Error(`Plugin ${plugin.id} must declare at least one extension point.`);
  }

  const duplicates = findDuplicates(plugin.extensionPoints);
  if (duplicates.length > 0) {
    throw new Error(`Plugin ${plugin.id} has duplicate extension points: ${duplicates.join(", ")}`);
  }

  for (const extensionPoint of plugin.extensionPoints) {
    validateExtensionPoint(extensionPoint, plugin.id);
  }
}

export function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}

function validateExtensionPoint(value: CodeDecayPluginExtensionPoint, pluginId: string): void {
  if (!EXTENSION_POINTS.has(value)) {
    throw new Error(`Plugin ${pluginId} uses unsupported extension point: ${value}`);
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort((left, right) => left.localeCompare(right));
}
