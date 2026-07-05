import type { ChangedSourceCoverage } from "./test-evidence";

export type ChangedPathTestProofStatus =
  | "proven_by_runtime_coverage"
  | "referenced_only_statically"
  | "weakened_by_mocking"
  | "unproven";

export type ChangedPathTestProofEvidence =
  | "runtime-coverage"
  | "static-reference"
  | "weak-mock"
  | "missing-proof";

export interface ChangedPathTestProofEntry {
  file: string;
  symbol?: string | undefined;
  line?: number | undefined;
  status: ChangedPathTestProofStatus;
  evidence: ChangedPathTestProofEvidence;
  proof: "deterministic" | "heuristic";
  runtimeCoverage?: ChangedSourceCoverage | undefined;
  staticReferences: string[];
  routeFiles: string[];
  weakenedByMocks: string[];
  reasons: string[];
  repairTask: string;
}

export interface ChangedPathTestProofSummary {
  total: number;
  provenByRuntimeCoverage: number;
  referencedOnlyStatically: number;
  weakenedByMocking: number;
  unproven: number;
}

export interface ChangedPathTestProofMap {
  summary: ChangedPathTestProofSummary;
  entries: ChangedPathTestProofEntry[];
}
