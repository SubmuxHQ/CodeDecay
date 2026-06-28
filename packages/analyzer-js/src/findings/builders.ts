import type { FileChange, Finding, RiskLevel } from "@submuxhq/codedecay-core";
import type { PathClassification } from "../classifiers/paths";

export function createRiskyAreaFinding(change: FileChange, classification: PathClassification): Finding {
  return {
    ruleId: `risky-${classification.kind}-change`,
    title: `${capitalize(classification.kind)} area changed`,
    description: `${change.path} touches a ${classification.kind} area and should be reviewed for regression impact.`,
    severity: classification.risk,
    category: classification.kind === "config" ? "configuration" : "regression",
    file: change.path,
    line: firstLine(change)
  };
}

export function createMissingNearbyTestsFinding(riskySourceFiles: FileChange[], severity: RiskLevel): Finding {
  return {
    ruleId: "missing-nearby-tests",
    title: "Risky source changes without changed tests",
    description: "This PR changes risky source areas but does not change any obvious test files.",
    severity,
    category: "coverage",
    file: riskySourceFiles[0]?.path,
    line: firstLine(riskySourceFiles[0])
  };
}

export function firstLine(change: FileChange | undefined): number | undefined {
  return change?.addedLines[0]?.line;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
