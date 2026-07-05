import type { RiskLevel } from "../risk";

export interface ImpactedArea {
  name: string;
  kind: "api" | "ui" | "database" | "auth" | "config" | "test" | "source" | "docs";
  risk: RiskLevel;
  files: string[];
}

export interface ImpactedRoute {
  framework: "nextjs" | "express" | "fastify" | "node";
  kind: "ui-route" | "api-route" | "middleware" | "route-handler";
  route: string;
  methods: string[];
  files: string[];
  risk: RiskLevel;
  reasons: string[];
  recommendedTests: string[];
}

export interface SymbolExport {
  name: string;
  kind: "named" | "default" | "reexport";
  line: number;
  endLine: number;
}

export interface SymbolImport {
  source: string;
  sourceFile?: string | undefined;
  sourceSymbol: string;
  localName: string;
  kind: "named" | "default" | "namespace" | "side-effect" | "reexport";
  line: number;
}

export interface SymbolCall {
  callee: string;
  line: number;
}

export interface SymbolGraphFile {
  path: string;
  role: "source" | "test";
  exports: SymbolExport[];
  imports: SymbolImport[];
  calls: SymbolCall[];
}

export interface SymbolImportEdge {
  sourceFile: string;
  sourceSymbol: string;
  importerFile: string;
  importedAs: string;
  importKind: SymbolImport["kind"];
  line: number;
}

export interface SymbolImpactGraph {
  schemaVersion: 1;
  artifactPath?: string | undefined;
  files: SymbolGraphFile[];
  edges: SymbolImportEdge[];
}

export interface SymbolImpactGraphSummary {
  schemaVersion: 1;
  artifactPath?: string | undefined;
  fileCount: number;
  edgeCount: number;
}

export interface SymbolImpact {
  file: string;
  symbol: string;
  exportKind: SymbolExport["kind"];
  line: number;
  importerFiles: string[];
  routeFiles: string[];
  likelyTests: string[];
  reasons: string[];
}
