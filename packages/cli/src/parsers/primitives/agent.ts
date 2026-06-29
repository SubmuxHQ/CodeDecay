import {
  AGENT_PROFILE_IDS,
  isAgentProfileId,
  type AgentProfileId,
  type AgentTaskBundleFormat
} from "@submuxhq/codedecay-agent";
import type { ConfigFormat } from "../../types";

const VALID_CONFIG_FORMATS = new Set<ConfigFormat>(["json", "markdown"]);

export function parseAgentFormat(value: string): AgentTaskBundleFormat {
  if (VALID_CONFIG_FORMATS.has(value as AgentTaskBundleFormat)) {
    return value as AgentTaskBundleFormat;
  }

  throw new Error(`Invalid agent format "${value}". Expected json or markdown.`);
}

export function parseAgentProfile(value: string): AgentProfileId {
  if (isAgentProfileId(value)) {
    return value;
  }

  throw new Error(`Invalid agent profile "${value}". Expected ${AGENT_PROFILE_IDS.join(", ")}.`);
}
