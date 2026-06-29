import type { CodeDecayToolAdapters } from "../types";
import { isPlainObject } from "./primitives";
import { normalizeAgentProcessToolAdapter } from "./tool-adapters/agent-process";
import { normalizeCoverageToolAdapter } from "./tool-adapters/coverage";
import { normalizeCommandToolAdapter } from "./tool-adapters/command";
import { normalizeSchemathesisToolAdapter } from "./tool-adapters/schemathesis";
import { normalizeSemgrepToolAdapter } from "./tool-adapters/semgrep";
import { normalizeStrykerToolAdapter } from "./tool-adapters/stryker";

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
