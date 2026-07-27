import type {
  RiskLevel,
  SecurityCandidateConfidence
} from "@submuxhq/codedecay-core";

export interface JavaScriptSecurityMatch {
  line: number;
  text: string;
  severity: RiskLevel;
  confidence: SecurityCandidateConfidence;
  evidence: string;
}
