import type { FileChange, ImpactedArea } from "@submuxhq/codedecay-core";

export interface ContractFileContext {
  change: FileChange;
  areaKinds: Set<ImpactedArea["kind"]>;
  content: string;
}

export interface ImportBoundaryContext {
  importer: ContractFileContext;
  specifier: string;
  targetPath: string;
  targetAreaKinds: Set<ImpactedArea["kind"]>;
  line: number;
}

export interface CodeownersEntry {
  pattern: string;
  owners: string[];
}

export interface CodeownersIndex {
  sourcePath?: string | undefined;
  entries: CodeownersEntry[];
}
