import type { CodeDecayReport, RiskLevel } from "@submuxhq/codedecay-core";
import type { LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { ReportFormat } from "@submuxhq/codedecay-report";

export interface AnalyzeOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ReportFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

export interface CliAnalysisContext {
  report: CodeDecayReport;
  loadedMemory: LoadedCodeDecayMemory;
}
