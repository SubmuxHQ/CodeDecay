import { cloneProductTesting } from "../clone";
import { DEFAULT_CODEDECAY_CONFIG, DEFAULT_PRODUCT_TARGET_TIMEOUT_MS } from "../defaults";
import type {
  CodeDecayProductApiEndpoint,
  CodeDecayProductApiMethod,
  CodeDecayProductTarget,
  CodeDecayProductTargetReadiness,
  CodeDecayProductTestingConfig,
  CodeDecaySafety
} from "../types";
import {
  isPlainObject,
  normalizeEnvironmentVariableName,
  normalizeNonEmptyString,
  normalizePositiveInteger,
  normalizeRuntimeUrl,
  normalizeStringRecord,
  normalizeUrlString
} from "./primitives";

export function normalizeProductTesting(
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
