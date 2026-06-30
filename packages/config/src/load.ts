import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { cloneConfig } from "./clone";
import { CONFIG_CANDIDATES, DEFAULT_CODEDECAY_CONFIG } from "./defaults";
import { normalizeCommands, normalizeProbes } from "./normalize/commands";
import { normalizeLlm } from "./normalize/llm";
import { normalizeMemoryProviders } from "./normalize/memory-providers";
import { normalizePlugins } from "./normalize/plugins";
import { normalizeProductTesting } from "./normalize/product";
import { isPlainObject } from "./normalize/primitives";
import { normalizeSafety } from "./normalize/safety";
import { normalizeToolAdapters } from "./normalize/tool-adapters";
import type { CodeDecayConfig, LoadedCodeDecayConfig, LoadCodeDecayConfigOptions } from "./types";

export function loadCodeDecayConfig(options: LoadCodeDecayConfigOptions): LoadedCodeDecayConfig {
  const sourcePath = findCodeDecayConfig(options.cwd);
  if (!sourcePath) {
    return {
      config: cloneConfig(DEFAULT_CODEDECAY_CONFIG)
    };
  }

  const raw = readFileSync(sourcePath, "utf8");
  const parsed = parseYamlConfig(raw, sourcePath);

  return {
    config: normalizeConfig(parsed, sourcePath),
    sourcePath
  };
}

export function findCodeDecayConfig(cwd: string): string | undefined {
  for (const candidate of CONFIG_CANDIDATES) {
    const path = resolve(cwd, candidate);
    if (existsSync(path)) {
      return path;
    }
  }

  return undefined;
}

function parseYamlConfig(raw: string, sourcePath: string): unknown {
  try {
    return YAML.parse(raw) ?? {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${message}`);
  }
}

function normalizeConfig(value: unknown, sourcePath: string): CodeDecayConfig {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: expected an object.`);
  }

  const version = value.version ?? 1;
  if (version !== 1) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: version must be 1.`);
  }

  const commands = normalizeCommands(value.commands, sourcePath);
  const probes = normalizeProbes(value.probes, sourcePath);
  const safety = normalizeSafety(value.safety, sourcePath);
  const llm = normalizeLlm(value.llm, sourcePath);
  const memoryProviders = normalizeMemoryProviders(value.memoryProviders, sourcePath);
  const toolAdapters = normalizeToolAdapters(value.toolAdapters, sourcePath);
  const productTesting = normalizeProductTesting(value.productTesting, safety, sourcePath);
  const plugins = normalizePlugins(value.plugins, sourcePath);

  return {
    version: 1,
    commands,
    probes,
    safety,
    llm,
    memoryProviders,
    toolAdapters,
    productTesting,
    plugins
  };
}
