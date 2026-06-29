import type { CodeDecayAgentBundleFormat, CodeDecayAgentProfile } from "../types";

export const AGENT_PROCESS_HARNESS_NAME = "agent-process";
export const DEFAULT_AGENT_PROCESS_TIMEOUT_MS = 300_000;
export const DEFAULT_AGENT_PROCESS_PROFILE: CodeDecayAgentProfile = "generic";
export const DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT: CodeDecayAgentBundleFormat = "markdown";
export const AGENT_PROCESS_BUNDLE_DIR = ".codedecay/local/agent-process";
