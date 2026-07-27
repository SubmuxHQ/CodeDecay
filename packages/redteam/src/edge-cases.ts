export { createEdgeCasePlan, MAX_RANKED_EDGE_CASES } from "./edge-cases/plan";

import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { createEdgeCasePlan } from "./edge-cases/plan";

export function suggestEdgeCases(report: CodeDecayReport) {
  return createEdgeCasePlan({ report }).ranked;
}
