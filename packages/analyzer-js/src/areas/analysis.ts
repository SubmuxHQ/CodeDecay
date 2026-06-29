import type { FileChange, Finding, ImpactedArea } from "@submuxhq/codedecay-core";
import { classifyChange } from "../classifiers/paths";
import { createRiskyAreaFinding } from "../findings/builders";

export interface ImpactedAreaAnalysis {
  impactedAreas: ImpactedArea[];
  findings: Finding[];
}

export function analyzeImpactedAreas(changedFiles: FileChange[]): ImpactedAreaAnalysis {
  const impactedAreas: ImpactedArea[] = [];
  const findings: Finding[] = [];

  for (const change of changedFiles) {
    const classification = classifyChange(change);
    if (!classification) {
      continue;
    }

    impactedAreas.push({
      name: classification.name,
      kind: classification.kind,
      risk: classification.risk,
      files: [change.path]
    });

    findings.push(createRiskyAreaFinding(change, classification));
  }

  return {
    impactedAreas,
    findings
  };
}
