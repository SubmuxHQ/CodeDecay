import type { HarnessFailureMode, HarnessRunStatus } from "./capabilities";
import type { Evidence } from "./evidence";

export interface HarnessRunContext {
  cwd: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  context?: Record<string, unknown> | undefined;
}

export interface HarnessFailure {
  mode: HarnessFailureMode;
  message: string;
  evidence?: Evidence[] | undefined;
}

export interface HarnessArtifact {
  path: string;
  description?: string | undefined;
}

export interface HarnessRunResult {
  harnessName: string;
  status: HarnessRunStatus;
  durationMs: number;
  evidence: Evidence[];
  artifacts: HarnessArtifact[];
  summary?: string | undefined;
  failure?: HarnessFailure | undefined;
}

export interface HarnessSummary {
  harnessName: string;
  status: HarnessRunStatus;
  summary: string;
  evidenceCount: number;
  failure?: HarnessFailure | undefined;
}
