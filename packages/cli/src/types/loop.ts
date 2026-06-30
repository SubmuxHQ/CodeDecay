import type { LoopFormat } from "@submuxhq/codedecay-harness";
import type { RiskLevel } from "@submuxhq/codedecay-core";

export interface LoopOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  maxRounds: number;
  agentCommand?: string | undefined;
  format: LoopFormat;
  output?: string | undefined;
  safeRiskLevel: RiskLevel;
}
