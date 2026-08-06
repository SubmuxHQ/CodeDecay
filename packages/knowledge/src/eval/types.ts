export const AGENT_EFFICACY_SCHEMA_VERSION = 1 as const;

export type TrialArm = "control" | "treatment";

export type AgentKind =
  | "honest-fake"
  | "cheating-fake"
  | "timeout-fake"
  | "unavailable-fake"
  | "external-cli";

export type EfficacyRunMode = "deterministic-fake-agent" | "opt-in-real-agent";

export type EfficacyVerdict =
  | "verified-completion"
  | "unverified"
  | "failed"
  | "provider-unavailable"
  | "timeout"
  | "safety-blocked"
  | "contamination";

export interface EfficacyScenario {
  id: string;
  title: string;
  requirementIds: string[];
  plantedDefect: string;
  cleanDecoy?: string | undefined;
  expectedOracle: {
    mustDetectDefect: boolean;
    mustNotFlagDecoy?: boolean | undefined;
  };
  allowedTools: string[];
  /** Hidden from agent prompts; used only by oracle. */
  oracleSecret: string;
}

export interface EfficacyAgentResult {
  arm: TrialArm;
  agentKind: AgentKind;
  claimedVerified: boolean;
  claimedChecksRan: boolean;
  printedOracleSecret: boolean;
  repairedDefect: boolean;
  flaggedDecoy: boolean;
  outputText: string;
  latencyMs: number;
  tokenUsage?: number | undefined;
  error?: string | undefined;
}

export interface EfficacyTrialResult {
  scenarioId: string;
  control: EfficacyAgentResult;
  treatment: EfficacyAgentResult;
  controlVerdict: EfficacyVerdict;
  treatmentVerdict: EfficacyVerdict;
  treatmentImproved: boolean;
  issues: string[];
}

export interface EfficacyRunReport {
  tool: "CodeDecay";
  schemaVersion: typeof AGENT_EFFICACY_SCHEMA_VERSION;
  generatedAt: string;
  runId: string;
  mode: EfficacyRunMode;
  publishedPackageTreatment: boolean;
  scenarios: EfficacyScenario[];
  trials: EfficacyTrialResult[];
  integrity: {
    labelSwapDetected: boolean;
    answerLeakDetected: boolean;
    issues: string[];
  };
  summary: {
    controlVerified: number;
    treatmentVerified: number;
    providerFailuresCounted: number;
    contaminationFailures: number;
  };
  limitations: string[];
  fullyVerified: false;
  safety: {
    commandsExecuted: boolean;
    networkCalled: boolean;
    hiddenProviderCalls: false;
    telemetry: false;
  };
  /** Present for opt-in real runs: provider identity when known. */
  realAgent?: {
    provider: string;
    command: string[];
    dryRun: boolean;
    optIn: true;
  };
}
