import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

export interface CodeDecayConfig {
  version: 1;
  commands: CodeDecayCommands;
  probes: CodeDecayProbe[];
  safety: CodeDecaySafety;
}

export interface CodeDecayCommands {
  test: string[];
  build: string[];
  start: string[];
}

export interface CodeDecayProbe {
  name: string;
  command: string;
  timeoutMs?: number | undefined;
}

export interface CodeDecaySafety {
  commandTimeoutMs: number;
  allowCommands: boolean;
}

export interface LoadedCodeDecayConfig {
  config: CodeDecayConfig;
  sourcePath?: string | undefined;
}

export interface LoadCodeDecayConfigOptions {
  cwd: string;
}

const CONFIG_CANDIDATES = [
  ".codedecay/config.yml",
  ".codedecay/config.yaml",
  "codedecay.config.yml",
  "codedecay.config.yaml"
];

export const DEFAULT_CODEDECAY_CONFIG: CodeDecayConfig = {
  version: 1,
  commands: {
    test: [],
    build: [],
    start: []
  },
  probes: [],
  safety: {
    commandTimeoutMs: 120_000,
    allowCommands: false
  }
};

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

  return {
    version: 1,
    commands,
    probes,
    safety
  };
}

function normalizeCommands(value: unknown, sourcePath: string): CodeDecayCommands {
  if (value === undefined) {
    return cloneCommands(DEFAULT_CODEDECAY_CONFIG.commands);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: commands must be an object.`);
  }

  return {
    test: normalizeCommandList(value.test, "commands.test", sourcePath),
    build: normalizeCommandList(value.build, "commands.build", sourcePath),
    start: normalizeCommandList(value.start, "commands.start", sourcePath)
  };
}

function normalizeCommandList(value: unknown, field: string, sourcePath: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a string or string array.`);
}

function normalizeProbes(value: unknown, sourcePath: string): CodeDecayProbe[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes must be an array.`);
  }

  return value.map((probe, index) => normalizeProbe(probe, index, sourcePath));
}

function normalizeProbe(value: unknown, index: number, sourcePath: string): CodeDecayProbe {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes[${index}] must be an object.`);
  }

  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes[${index}].name is required.`);
  }

  if (typeof value.command !== "string" || value.command.trim().length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes[${index}].command is required.`);
  }

  const probe: CodeDecayProbe = {
    name: value.name,
    command: value.command
  };

  if (value.timeoutMs !== undefined) {
    probe.timeoutMs = normalizePositiveInteger(value.timeoutMs, `probes[${index}].timeoutMs`, sourcePath);
  }

  return probe;
}

function normalizeSafety(value: unknown, sourcePath: string): CodeDecaySafety {
  if (value === undefined) {
    return { ...DEFAULT_CODEDECAY_CONFIG.safety };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: safety must be an object.`);
  }

  const commandTimeoutMs =
    value.commandTimeoutMs === undefined
      ? DEFAULT_CODEDECAY_CONFIG.safety.commandTimeoutMs
      : normalizePositiveInteger(value.commandTimeoutMs, "safety.commandTimeoutMs", sourcePath);

  const allowCommands =
    value.allowCommands === undefined
      ? DEFAULT_CODEDECAY_CONFIG.safety.allowCommands
      : normalizeBoolean(value.allowCommands, "safety.allowCommands", sourcePath);

  return {
    commandTimeoutMs,
    allowCommands
  };
}

function normalizePositiveInteger(value: unknown, field: string, sourcePath: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a positive integer.`);
}

function normalizeBoolean(value: unknown, field: string, sourcePath: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a boolean.`);
}

function cloneConfig(config: CodeDecayConfig): CodeDecayConfig {
  return {
    version: config.version,
    commands: cloneCommands(config.commands),
    probes: config.probes.map((probe) => ({ ...probe })),
    safety: { ...config.safety }
  };
}

function cloneCommands(commands: CodeDecayCommands): CodeDecayCommands {
  return {
    test: [...commands.test],
    build: [...commands.build],
    start: [...commands.start]
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
