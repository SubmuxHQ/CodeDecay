export const SCENARIO_IDS = ["auth-api", "weak-test", "clean-decoy"] as const;
export const REVIEW_STATES = ["base", "risky", "repaired"] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type EvidenceKind = "deterministic" | "tool" | "memory" | "codex-suggestion";

export interface JudgeFinding {
  ruleId: string;
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
  evidenceKind: EvidenceKind;
  file?: string;
  line?: number;
}

export interface JudgeLabResult {
  scenarioId: ScenarioId;
  scenarioTitle: string;
  scenarioKicker: string;
  state: ReviewState;
  execution: {
    mode: "live" | "precomputed";
    label: string;
    engineVersion: string;
    sourceCommit: string;
    generatedAt: string;
    durationMs: number | null;
    reproduction: string;
  };
  diff: {
    file: string;
    before: string;
    after: string;
  };
  summary: {
    riskLevel: "low" | "medium" | "high";
    mergeRiskScore: number;
    securityScore: number;
    recommendation: string;
  };
  impactedRoute: {
    route: string;
    methods: string[];
    userImpact: string;
  };
  testProof: {
    status: "missing" | "weak" | "present" | "not-applicable";
    detail: string;
  };
  findings: JudgeFinding[];
  edgeCases: string[];
  repairTasks: string[];
  verification: string[];
  links: {
    fixture: string;
    engine: string;
    benchmark: string;
    release: string;
    sourceTree: string;
  };
}

export interface ScenarioSummary {
  id: ScenarioId;
  title: string;
  kicker: string;
  blurb: string;
  mode: "live" | "precomputed";
}

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === "string" && SCENARIO_IDS.includes(value as ScenarioId);
}

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && REVIEW_STATES.includes(value as ReviewState);
}
