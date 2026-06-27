import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

export interface CodeDecayConfig {
  version: 1;
  commands: CodeDecayCommands;
  probes: CodeDecayProbe[];
  safety: CodeDecaySafety;
  llm: CodeDecayLlmConfig;
  toolAdapters: CodeDecayToolAdapters;
  productTesting: CodeDecayProductTestingConfig;
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

export interface CodeDecayLlmConfig {
  provider: "disabled" | "ollama" | "litellm";
  model?: string | undefined;
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  timeoutMs: number;
}

export interface CodeDecayToolAdapters {
  playwright?: CodeDecayCommandToolAdapter | undefined;
  stryker?: CodeDecayStrykerToolAdapter | undefined;
  schemathesis?: CodeDecaySchemathesisToolAdapter | undefined;
  pact?: CodeDecayCommandToolAdapter | undefined;
}

export interface CodeDecayCommandToolAdapter {
  enabled: boolean;
  command?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface CodeDecaySchemathesisToolAdapter extends CodeDecayCommandToolAdapter {
  schema?: string | undefined;
  baseUrl?: string | undefined;
}

export interface CodeDecayStrykerToolAdapter extends CodeDecayCommandToolAdapter {
  reportPath?: string | undefined;
}

export interface CodeDecayProductTestingConfig {
  targets: Record<string, CodeDecayProductTarget>;
}

export interface CodeDecayProductTarget {
  id: string;
  baseUrl?: string | undefined;
  startCommand?: string | undefined;
  healthCheck?: string | undefined;
  authSetupCommand?: string | undefined;
  teardownCommand?: string | undefined;
  previewUrlEnv?: string | undefined;
  apiEndpoints: CodeDecayProductApiEndpoint[];
  timeoutMs: number;
  readiness: CodeDecayProductTargetReadiness;
}

export type CodeDecayProductApiMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CodeDecayProductApiEndpoint {
  id?: string | undefined;
  method: CodeDecayProductApiMethod;
  path: string;
  expectedStatuses: number[];
  headers?: Record<string, string> | undefined;
  body?: unknown;
}

export type CodeDecayProductTargetReadinessStatus =
  | "ready"
  | "command-required"
  | "needs-command-approval"
  | "missing-preview-url"
  | "unresolved";

export interface CodeDecayProductTargetReadiness {
  status: CodeDecayProductTargetReadinessStatus;
  mode: "base-url" | "preview-url-env" | "start-command" | "unresolved";
  effectiveBaseUrl?: string | undefined;
  commandsRequired: string[];
  commandsAllowed: boolean;
  willRunCommands: false;
  notes: string[];
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
  },
  llm: {
    provider: "disabled",
    timeoutMs: 30_000
  },
  toolAdapters: {},
  productTesting: {
    targets: {}
  }
};

const DEFAULT_PRODUCT_TARGET_TIMEOUT_MS = 60_000;

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
  const toolAdapters = normalizeToolAdapters(value.toolAdapters, sourcePath);
  const productTesting = normalizeProductTesting(value.productTesting, safety, sourcePath);

  return {
    version: 1,
    commands,
    probes,
    safety,
    llm,
    toolAdapters,
    productTesting
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

function normalizeLlm(value: unknown, sourcePath: string): CodeDecayLlmConfig {
  if (value === undefined) {
    return { ...DEFAULT_CODEDECAY_CONFIG.llm };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm must be an object.`);
  }

  const provider = value.provider === undefined ? DEFAULT_CODEDECAY_CONFIG.llm.provider : value.provider;
  if (provider !== "disabled" && provider !== "ollama" && provider !== "litellm") {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.provider must be disabled, ollama, or litellm.`);
  }

  const llmConfig: CodeDecayLlmConfig = {
    provider,
    timeoutMs:
      value.timeoutMs === undefined
        ? DEFAULT_CODEDECAY_CONFIG.llm.timeoutMs
        : normalizePositiveInteger(value.timeoutMs, "llm.timeoutMs", sourcePath)
  };

  if (value.model !== undefined) {
    if (typeof value.model !== "string" || value.model.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.model must be a non-empty string.`);
    }
    llmConfig.model = value.model;
  }

  if (value.endpoint !== undefined) {
    if (typeof value.endpoint !== "string" || value.endpoint.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.endpoint must be a non-empty string.`);
    }
    llmConfig.endpoint = value.endpoint;
  }

  if (value.apiKeyEnv !== undefined) {
    if (typeof value.apiKeyEnv !== "string" || value.apiKeyEnv.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.apiKeyEnv must be a non-empty string.`);
    }
    llmConfig.apiKeyEnv = value.apiKeyEnv;
  }

  return llmConfig;
}

function normalizeToolAdapters(value: unknown, sourcePath: string): CodeDecayToolAdapters {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters must be an object.`);
  }

  const adapters: CodeDecayToolAdapters = {};
  const playwright = normalizeCommandToolAdapter(value.playwright, "toolAdapters.playwright", sourcePath);
  const stryker = normalizeStrykerToolAdapter(value.stryker, sourcePath);
  const schemathesis = normalizeSchemathesisToolAdapter(value.schemathesis, sourcePath);
  const pact = normalizeCommandToolAdapter(value.pact, "toolAdapters.pact", sourcePath);

  if (playwright) {
    adapters.playwright = playwright;
  }

  if (stryker) {
    adapters.stryker = stryker;
  }

  if (schemathesis) {
    adapters.schemathesis = schemathesis;
  }

  if (pact) {
    adapters.pact = pact;
  }

  return adapters;
}

function normalizeProductTesting(
  value: unknown,
  safety: CodeDecaySafety,
  sourcePath: string
): CodeDecayProductTestingConfig {
  if (value === undefined) {
    return cloneProductTesting(DEFAULT_CODEDECAY_CONFIG.productTesting);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: productTesting must be an object.`);
  }

  if (value.targets === undefined) {
    return {
      targets: {}
    };
  }

  if (!isPlainObject(value.targets)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: productTesting.targets must be an object.`);
  }

  const targets: Record<string, CodeDecayProductTarget> = {};
  for (const id of Object.keys(value.targets).sort((left, right) => left.localeCompare(right))) {
    if (id.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: productTesting.targets contains an empty target id.`);
    }

    targets[id] = normalizeProductTarget(id, value.targets[id], safety, sourcePath);
  }

  return {
    targets
  };
}

function normalizeProductTarget(
  id: string,
  value: unknown,
  safety: CodeDecaySafety,
  sourcePath: string
): CodeDecayProductTarget {
  const field = `productTesting.targets.${id}`;
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  const target: Omit<CodeDecayProductTarget, "readiness"> = {
    id,
    apiEndpoints: normalizeProductApiEndpoints(value.apiEndpoints, `${field}.apiEndpoints`, sourcePath),
    timeoutMs:
      value.timeoutMs === undefined
        ? DEFAULT_PRODUCT_TARGET_TIMEOUT_MS
        : normalizePositiveInteger(value.timeoutMs, `${field}.timeoutMs`, sourcePath)
  };

  if (value.baseUrl !== undefined) {
    target.baseUrl = normalizeUrlString(value.baseUrl, `${field}.baseUrl`, sourcePath);
  }

  if (value.startCommand !== undefined) {
    target.startCommand = normalizeNonEmptyString(value.startCommand, `${field}.startCommand`, sourcePath);
  }

  if (value.healthCheck !== undefined) {
    target.healthCheck = normalizeUrlString(value.healthCheck, `${field}.healthCheck`, sourcePath);
  }

  if (value.authSetupCommand !== undefined) {
    target.authSetupCommand = normalizeNonEmptyString(value.authSetupCommand, `${field}.authSetupCommand`, sourcePath);
  }

  if (value.teardownCommand !== undefined) {
    target.teardownCommand = normalizeNonEmptyString(value.teardownCommand, `${field}.teardownCommand`, sourcePath);
  }

  if (value.previewUrlEnv !== undefined) {
    target.previewUrlEnv = normalizeEnvironmentVariableName(value.previewUrlEnv, `${field}.previewUrlEnv`, sourcePath);
  }

  return {
    ...target,
    readiness: createProductTargetReadiness(target, safety)
  };
}

function normalizeProductApiEndpoints(value: unknown, field: string, sourcePath: string): CodeDecayProductApiEndpoint[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an array.`);
  }

  return value.map((endpoint, index) => normalizeProductApiEndpoint(endpoint, `${field}[${index}]`, sourcePath));
}

function normalizeProductApiEndpoint(value: unknown, field: string, sourcePath: string): CodeDecayProductApiEndpoint {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  const method = normalizeProductApiMethod(value.method, `${field}.method`, sourcePath);
  const path = normalizeProductApiPath(value.path, `${field}.path`, sourcePath);
  const expectedStatuses = normalizeProductApiExpectedStatuses(value.expectedStatuses, `${field}.expectedStatuses`, sourcePath);
  const endpoint: CodeDecayProductApiEndpoint = {
    method,
    path,
    expectedStatuses
  };

  if (value.id !== undefined) {
    endpoint.id = normalizeNonEmptyString(value.id, `${field}.id`, sourcePath);
  }

  if (value.headers !== undefined) {
    endpoint.headers = normalizeStringRecord(value.headers, `${field}.headers`, sourcePath);
  }

  if (value.body !== undefined) {
    endpoint.body = value.body;
  }

  return endpoint;
}

function createProductTargetReadiness(
  target: Omit<CodeDecayProductTarget, "readiness">,
  safety: CodeDecaySafety
): CodeDecayProductTargetReadiness {
  const commandsRequired = [
    target.authSetupCommand,
    target.startCommand,
    target.teardownCommand
  ].filter((command): command is string => command !== undefined);
  const resolvedPreviewUrl = target.previewUrlEnv ? process.env[target.previewUrlEnv] : undefined;
  const effectiveBaseUrl = target.baseUrl ?? (resolvedPreviewUrl ? normalizeRuntimeUrl(resolvedPreviewUrl) : undefined);
  const notes: string[] = ["Config loading never executes product target commands."];

  if (effectiveBaseUrl) {
    if (target.baseUrl) {
      notes.push("Target can use an already-running app at baseUrl.");
    } else if (target.previewUrlEnv) {
      notes.push(`Target resolved preview URL from ${target.previewUrlEnv}.`);
    }

    return {
      status: "ready",
      mode: target.baseUrl ? "base-url" : "preview-url-env",
      effectiveBaseUrl,
      commandsRequired,
      commandsAllowed: safety.allowCommands,
      willRunCommands: false,
      notes
    };
  }

  if (target.previewUrlEnv) {
    notes.push(`Environment variable ${target.previewUrlEnv} is not set or is not a valid URL.`);
    return {
      status: "missing-preview-url",
      mode: "preview-url-env",
      commandsRequired,
      commandsAllowed: safety.allowCommands,
      willRunCommands: false,
      notes
    };
  }

  if (target.startCommand) {
    notes.push(
      safety.allowCommands
        ? "Target requires explicit execution to start the app before verification."
        : "Target start command is configured but safety.allowCommands is false."
    );
    return {
      status: safety.allowCommands ? "command-required" : "needs-command-approval",
      mode: "start-command",
      commandsRequired,
      commandsAllowed: safety.allowCommands,
      willRunCommands: false,
      notes
    };
  }

  notes.push("Target needs baseUrl, previewUrlEnv, or startCommand before product verification can run.");
  return {
    status: "unresolved",
    mode: "unresolved",
    commandsRequired,
    commandsAllowed: safety.allowCommands,
    willRunCommands: false,
    notes
  };
}

function normalizeCommandToolAdapter(
  value: unknown,
  field: string,
  sourcePath: string
): CodeDecayCommandToolAdapter | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return {
      enabled: value
    };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a boolean or object.`);
  }

  const adapter: CodeDecayCommandToolAdapter = {
    enabled: value.enabled === undefined ? true : normalizeBoolean(value.enabled, `${field}.enabled`, sourcePath)
  };

  if (value.command !== undefined) {
    adapter.command = normalizeNonEmptyString(value.command, `${field}.command`, sourcePath);
  }

  if (value.timeoutMs !== undefined) {
    adapter.timeoutMs = normalizePositiveInteger(value.timeoutMs, `${field}.timeoutMs`, sourcePath);
  }

  return adapter;
}

function normalizeSchemathesisToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecaySchemathesisToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.schemathesis", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.schemathesis must be a boolean or object.`);
  }

  const schemathesis: CodeDecaySchemathesisToolAdapter = { ...adapter };

  if (value.schema !== undefined) {
    schemathesis.schema = normalizeNonEmptyString(value.schema, "toolAdapters.schemathesis.schema", sourcePath);
  }

  if (value.baseUrl !== undefined) {
    schemathesis.baseUrl = normalizeNonEmptyString(value.baseUrl, "toolAdapters.schemathesis.baseUrl", sourcePath);
  }

  return schemathesis;
}

function normalizeStrykerToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecayStrykerToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.stryker", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.stryker must be a boolean or object.`);
  }

  const stryker: CodeDecayStrykerToolAdapter = { ...adapter };

  if (value.reportPath !== undefined) {
    stryker.reportPath = normalizeNonEmptyString(value.reportPath, "toolAdapters.stryker.reportPath", sourcePath);
  }

  return stryker;
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

function normalizeProductApiMethod(value: unknown, field: string, sourcePath: string): CodeDecayProductApiMethod {
  const text = normalizeNonEmptyString(value, field, sourcePath).toUpperCase();
  if (["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(text)) {
    return text as CodeDecayProductApiMethod;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be one of GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE.`);
}

function normalizeProductApiPath(value: unknown, field: string, sourcePath: string): string {
  const text = normalizeNonEmptyString(value, field, sourcePath);
  if (text.startsWith("/") || /^https?:\/\//i.test(text)) {
    return text;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an absolute path or http/https URL.`);
}

function normalizeProductApiExpectedStatuses(value: unknown, field: string, sourcePath: string): number[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a non-empty array of HTTP status codes.`);
  }

  return value.map((status, index) => {
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      return status;
    }

    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field}[${index}] must be an HTTP status code.`);
  });
}

function normalizeStringRecord(value: unknown, field: string, sourcePath: string): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field}.${key} must be a string.`);
    }

    record[key] = item;
  }

  return record;
}

function normalizeNonEmptyString(value: unknown, field: string, sourcePath: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a non-empty string.`);
}

function normalizeUrlString(value: unknown, field: string, sourcePath: string): string {
  const text = normalizeNonEmptyString(value, field, sourcePath);
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an http or https URL.`);
  }
}

function normalizeRuntimeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function normalizeEnvironmentVariableName(value: unknown, field: string, sourcePath: string): string {
  const text = normalizeNonEmptyString(value, field, sourcePath);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    return text;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a valid environment variable name.`);
}

function cloneConfig(config: CodeDecayConfig): CodeDecayConfig {
  return {
    version: config.version,
    commands: cloneCommands(config.commands),
    probes: config.probes.map((probe) => ({ ...probe })),
    safety: { ...config.safety },
    llm: { ...config.llm },
    toolAdapters: cloneToolAdapters(config.toolAdapters),
    productTesting: cloneProductTesting(config.productTesting)
  };
}

function cloneCommands(commands: CodeDecayCommands): CodeDecayCommands {
  return {
    test: [...commands.test],
    build: [...commands.build],
    start: [...commands.start]
  };
}

function cloneToolAdapters(toolAdapters: CodeDecayToolAdapters): CodeDecayToolAdapters {
  const cloned: CodeDecayToolAdapters = {};

  if (toolAdapters.playwright) {
    cloned.playwright = { ...toolAdapters.playwright };
  }

  if (toolAdapters.stryker) {
    cloned.stryker = { ...toolAdapters.stryker };
  }

  if (toolAdapters.schemathesis) {
    cloned.schemathesis = { ...toolAdapters.schemathesis };
  }

  if (toolAdapters.pact) {
    cloned.pact = { ...toolAdapters.pact };
  }

  return cloned;
}

function cloneProductTesting(productTesting: CodeDecayProductTestingConfig): CodeDecayProductTestingConfig {
  return {
    targets: Object.fromEntries(
      Object.entries(productTesting.targets).map(([id, target]) => [
        id,
        {
          ...target,
          apiEndpoints: target.apiEndpoints.map((endpoint) => ({
            ...endpoint,
            expectedStatuses: [...endpoint.expectedStatuses],
            headers: endpoint.headers ? { ...endpoint.headers } : undefined
          })),
          readiness: {
            ...target.readiness,
            commandsRequired: [...target.readiness.commandsRequired],
            notes: [...target.readiness.notes]
          }
        }
      ])
    )
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
