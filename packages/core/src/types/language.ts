export type LanguageSupportStatus = "supported" | "limited" | "unsupported";

export type LanguageParserCapability =
  | "path-classification"
  | "diff-line-analysis"
  | "route-impact"
  | "runtime-coverage"
  | "test-audit"
  | "function-metrics"
  | "security-matchers";

export interface LanguageFileSupport {
  path: string;
  language: string;
  status: LanguageSupportStatus;
  parser: string;
  capabilities: LanguageParserCapability[];
  limitation?: string | undefined;
}

export interface LanguageAnalysisSummary {
  files: LanguageFileSupport[];
  supportedFiles: string[];
  limitedFiles: string[];
  unsupportedFiles: string[];
}
