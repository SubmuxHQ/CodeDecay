import type { RiskLevel } from "../../risk";
import type { ProductFailureArtifact } from "./artifact";
import type { ProductCheckKind } from "./check";
import type { ProductFailureClassification } from "./classification";
import type { ProductFailureStep } from "./step";
import type { ProductFailureTarget } from "./target";

export interface ProductFailureBundle {
  schemaVersion: 1;
  id: string;
  checkId: string;
  checkKind: ProductCheckKind;
  priority: RiskLevel;
  target: ProductFailureTarget;
  title: string;
  summary: string;
  classification: ProductFailureClassification;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  failedStep: ProductFailureStep;
  neighboringSteps: ProductFailureStep[];
  artifacts: ProductFailureArtifact[];
  expected: string;
  actual: string;
  impactedFiles: string[];
  rootCauseHypothesis?: string | undefined;
  suggestedFixTasks: string[];
  rerunCommand: string;
}
