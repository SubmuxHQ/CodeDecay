import type { ConfigRequirement, HarnessCapability } from "./capabilities";
import type { Evidence } from "./evidence";
import type { HarnessPlan, HarnessPlanInput } from "./plan";
import type { HarnessRunContext, HarnessRunResult, HarnessSummary } from "./result";

export interface CodeDecayHarness {
  name: string;
  capabilities: HarnessCapability[];
  requiredConfig: ConfigRequirement[];
  plan(input: HarnessPlanInput): Promise<HarnessPlan>;
  run(plan: HarnessPlan, context: HarnessRunContext): Promise<HarnessRunResult>;
  collectEvidence(result: HarnessRunResult): Promise<Evidence[]>;
  summarize(evidence: Evidence[]): Promise<HarnessSummary>;
}
