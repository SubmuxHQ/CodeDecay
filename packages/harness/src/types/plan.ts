import type { Evidence } from "./evidence";

export interface HarnessPlanInput {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  evidence: Evidence[];
  context?: Record<string, unknown> | undefined;
}

export interface HarnessPlanStep {
  id: string;
  title: string;
  description?: string | undefined;
}

export interface HarnessPlan {
  id: string;
  harnessName: string;
  summary: string;
  steps: HarnessPlanStep[];
  requiresApproval: boolean;
}
