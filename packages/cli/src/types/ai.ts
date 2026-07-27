import type { RiskLevel } from "@submuxhq/codedecay-core";
import type { AgentOptions } from "./agent";

export interface AiOptions extends AgentOptions {
  withChecks?: boolean | undefined;
  failOn?: RiskLevel | undefined;
  failOnRequirements?: boolean | undefined;
}
