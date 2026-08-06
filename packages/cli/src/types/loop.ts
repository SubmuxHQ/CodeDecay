import type { LoopFormat } from "@submuxhq/codedecay-harness";
import type { RiskLevel } from "@submuxhq/codedecay-core";

export interface LoopOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  maxRounds: number;
  agentCommand?: string | undefined;
  builderCommand?: string | undefined;
  verifierCommand?: string | undefined;
  builderId?: string | undefined;
  verifierId?: string | undefined;
  format: LoopFormat;
  output?: string | undefined;
  safeRiskLevel: RiskLevel;
  securityScoreThreshold: number;
  task?: string | undefined;
  requirements?: string | undefined;
  maxWallTimeMs?: number | undefined;
  maxChangedFiles?: number | undefined;
  maxModelCalls?: number | undefined;
  allowedPaths?: string[] | undefined;
  protectedPaths?: string[] | undefined;
  resumeFrom?: string | undefined;
  runId?: string | undefined;
}
