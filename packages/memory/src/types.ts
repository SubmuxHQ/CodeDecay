import type {
  AnalyzerResult,
  FileChange,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";

export interface CodeDecayMemory {
  version: 1;
  flows: MemoryFlow[];
  commands: MemoryCommand[];
  invariants: MemoryInvariant[];
  architecture: MemoryArchitectureNote[];
  regressions: MemoryRegression[];
}

export interface MemoryMatcher {
  files?: string[] | undefined;
  areas?: ImpactedArea["kind"][] | undefined;
  productPaths?: string[] | undefined;
}

export interface MemoryFlow extends MemoryMatcher {
  name: string;
  description?: string | undefined;
  checks?: string[] | undefined;
}

export interface MemoryCommand extends MemoryMatcher {
  name: string;
  command: string;
  description?: string | undefined;
}

export interface MemoryInvariant extends MemoryMatcher {
  name: string;
  description: string;
  severity?: RiskLevel | undefined;
}

export interface MemoryArchitectureNote extends MemoryMatcher {
  title: string;
  note: string;
}

export interface MemoryRegression extends MemoryMatcher {
  title: string;
  description: string;
  check?: string | undefined;
  severity?: RiskLevel | undefined;
}

export interface LoadedCodeDecayMemory {
  memory: CodeDecayMemory;
  sourcePath?: string | undefined;
}

export interface MemoryImportCounts {
  flows: number;
  commands: number;
  invariants: number;
  architecture: number;
  regressions: number;
}

export interface MemoryImportResult {
  memory: CodeDecayMemory;
  added: MemoryImportCounts;
  merged: MemoryImportCounts;
}

export interface MemoryLearnResult extends MemoryImportResult {
  learned: MemoryImportCounts;
}

export type MemoryProviderKind = "local" | "external";

export interface MemoryProviderLoadOptions {
  rootDir: string;
}

export interface MemoryProvider {
  id: string;
  name: string;
  kind: MemoryProviderKind;
  load(options: MemoryProviderLoadOptions): LoadedCodeDecayMemory;
}

export interface MemoryContextInput {
  memory: CodeDecayMemory;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  analyzerResult: AnalyzerResult;
}

export const DEFAULT_CODEDECAY_MEMORY: CodeDecayMemory = {
  version: 1,
  flows: [],
  commands: [],
  invariants: [],
  architecture: [],
  regressions: []
};
