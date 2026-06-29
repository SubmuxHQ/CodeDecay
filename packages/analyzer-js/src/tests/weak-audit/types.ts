import type { ChangedLine, Finding } from "@submuxhq/codedecay-core";

export interface TestAuditResult {
  findings: Finding[];
  recommendedTests: string[];
}

export interface WeakTestContext {
  content: string;
  lines: string[];
  assertionLines: ChangedLine[];
  snapshotLines: ChangedLine[];
  mockLines: ChangedLine[];
}
