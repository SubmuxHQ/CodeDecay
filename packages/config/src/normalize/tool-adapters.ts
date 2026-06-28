import type {
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProcessToolAdapter,
  CodeDecayAgentProfile,
  CodeDecayCommandToolAdapter,
  CodeDecayCoverageFailOn,
  CodeDecayCoverageToolAdapter,
  CodeDecaySchemathesisToolAdapter,
  CodeDecaySemgrepToolAdapter,
  CodeDecayStrykerToolAdapter,
  CodeDecayToolAdapters,
  CodeDecayToolSeverity
} from "../types";
import {
  isPlainObject,
  normalizeBoolean,
  normalizeNonEmptyString,
  normalizePositiveInteger,
  normalizeStringList
} from "./primitives";

export function normalizeToolAdapters(value: unknown, sourcePath: string): CodeDecayToolAdapters {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters must be an object.`);
  }

  const adapters: CodeDecayToolAdapters = {};
  const agentProcess = normalizeAgentProcessToolAdapter(value.agentProcess, sourcePath);
  const playwright = normalizeCommandToolAdapter(value.playwright, "toolAdapters.playwright", sourcePath);
  const stryker = normalizeStrykerToolAdapter(value.stryker, sourcePath);
  const schemathesis = normalizeSchemathesisToolAdapter(value.schemathesis, sourcePath);
  const pact = normalizeCommandToolAdapter(value.pact, "toolAdapters.pact", sourcePath);
  const semgrep = normalizeSemgrepToolAdapter(value.semgrep, sourcePath);
  const coverage = normalizeCoverageToolAdapter(value.coverage, sourcePath);

  if (agentProcess) {
    adapters.agentProcess = agentProcess;
  }

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

  if (semgrep) {
    adapters.semgrep = semgrep;
  }

  if (coverage) {
    adapters.coverage = coverage;
  }

  return adapters;
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

function normalizeAgentProcessToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecayAgentProcessToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.agentProcess", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.agentProcess must be a boolean or object.`);
  }

  const agentProcess: CodeDecayAgentProcessToolAdapter = { ...adapter };

  if (value.profile !== undefined) {
    agentProcess.profile = normalizeAgentProfile(value.profile, "toolAdapters.agentProcess.profile", sourcePath);
  }

  if (value.bundleFormat !== undefined) {
    agentProcess.bundleFormat = normalizeAgentBundleFormat(
      value.bundleFormat,
      "toolAdapters.agentProcess.bundleFormat",
      sourcePath
    );
  }

  return agentProcess;
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

function normalizeSemgrepToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecaySemgrepToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.semgrep", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.semgrep must be a boolean or object.`);
  }

  const semgrep: CodeDecaySemgrepToolAdapter = { ...adapter };

  if (value.config !== undefined) {
    semgrep.config = normalizeNonEmptyString(value.config, "toolAdapters.semgrep.config", sourcePath);
  }

  if (value.reportPath !== undefined) {
    semgrep.reportPath = normalizeNonEmptyString(value.reportPath, "toolAdapters.semgrep.reportPath", sourcePath);
  }

  if (value.failOnSeverity !== undefined) {
    semgrep.failOnSeverity = normalizeToolSeverity(value.failOnSeverity, "toolAdapters.semgrep.failOnSeverity", sourcePath);
  }

  return semgrep;
}

function normalizeCoverageToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecayCoverageToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.coverage", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.coverage must be a boolean or object.`);
  }

  const coverage: CodeDecayCoverageToolAdapter = { ...adapter };

  if (value.reportPaths !== undefined) {
    coverage.reportPaths = normalizeStringList(value.reportPaths, "toolAdapters.coverage.reportPaths", sourcePath);
  }

  if (value.failOn !== undefined) {
    coverage.failOn = normalizeCoverageFailOn(value.failOn, "toolAdapters.coverage.failOn", sourcePath);
  }

  return coverage;
}

function normalizeToolSeverity(value: unknown, field: string, sourcePath: string): CodeDecayToolSeverity {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be low, medium, or high.`);
}

function normalizeAgentProfile(value: unknown, field: string, sourcePath: string): CodeDecayAgentProfile {
  if (
    value === "generic" ||
    value === "codex" ||
    value === "claude-code" ||
    value === "cursor" ||
    value === "pi" ||
    value === "opencode" ||
    value === "desktop"
  ) {
    return value;
  }

  throw new Error(
    `Invalid CodeDecay config at ${sourcePath}: ${field} must be generic, codex, claude-code, cursor, pi, opencode, or desktop.`
  );
}

function normalizeAgentBundleFormat(value: unknown, field: string, sourcePath: string): CodeDecayAgentBundleFormat {
  if (value === "markdown" || value === "json") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be markdown or json.`);
}

function normalizeCoverageFailOn(value: unknown, field: string, sourcePath: string): CodeDecayCoverageFailOn {
  if (value === "none" || value === "uncovered") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be none or uncovered.`);
}
