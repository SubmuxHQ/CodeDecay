import type { CodeDecayAgentProcessToolAdapter } from "../../types";
import { isPlainObject } from "../primitives";
import { normalizeAgentBundleFormat, normalizeAgentProfile } from "./enums";
import { normalizeCommandToolAdapter } from "./command";

export function normalizeAgentProcessToolAdapter(
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
