import type { Finding, RiskLevel, SecurityCandidate, SecuritySkippedFile } from "@submuxhq/codedecay-core";

export interface SecurityMatcherContext {
  filePath: string;
  content: string;
}

export interface SecurityMatcherExample {
  filePath: string;
  content: string;
}

export interface SecurityMatcher {
  ruleId: string;
  cwe?: string | undefined;
  title: string;
  description: string;
  severity: RiskLevel;
  confidence: SecurityCandidate["confidence"];
  languages: string[];
  filePatterns: string[];
  examples: SecurityMatcherExample[];
  match(context: SecurityMatcherContext): SecurityCandidate[];
}

export interface SecurityScanFile {
  path: string;
  content: string;
}

export interface SecurityScanInput {
  files: SecurityScanFile[];
  registry?: SecurityMatcherRegistryLike | undefined;
}

export interface SecurityMatcherRegistryLike {
  list(): SecurityMatcher[];
}

export interface SecurityScanResult {
  candidates: SecurityCandidate[];
  findings: Finding[];
  scannedFiles: string[];
  skippedFiles: SecuritySkippedFile[];
}
