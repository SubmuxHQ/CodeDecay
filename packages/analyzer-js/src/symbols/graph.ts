import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { parse } from "@babel/parser";
import type {
  FileChange,
  ImpactedRoute,
  SymbolCall,
  SymbolExport,
  SymbolGraphFile,
  SymbolImpact,
  SymbolImpactGraph,
  SymbolImpactGraphSummary,
  SymbolImport,
  SymbolImportEdge
} from "@submuxhq/codedecay-core";
import { getNodeType, walk, type AstNode } from "../ast/traverse";
import { readCachedAnalyzerArtifacts } from "../cache/artifacts";
import { isSourcePath, isTestPath } from "../classifiers/paths";
import { listRepoFiles } from "../files/repo";
import { extractLocalImportSpecifiers, resolveLocalImportSpecifier } from "../imports/graph";
import { normalizePath } from "../imports/graph/path";
import { analyzePythonImpactAdapter } from "../python/impact-adapter";
import { detectRoutesForFile } from "../routes/impact";
import {
  createJsImpactGraphAdapterResult,
  type JsImpactGraphAdapterResult
} from "./impact-adapter";
import { createRemixImpactGraphFragment } from "./remix-impact-adapter";

export const SYMBOL_IMPACT_GRAPH_PATH = ".codedecay/local/symbol-impact-graph.json";

const SOURCE_EXTENSION_CANDIDATES = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const MAX_SYMBOL_PROPAGATION_DEPTH = 4;

export interface SymbolImpactAnalysis {
  graph: SymbolImpactGraph;
  graphSummary: SymbolImpactGraphSummary;
  impactGraph: JsImpactGraphAdapterResult["graph"];
  impactGraphSummary: JsImpactGraphAdapterResult["summary"];
  impacts: SymbolImpact[];
  impactedRoutes: ImpactedRoute[];
  recommendedTests: string[];
}

interface ParsedFile {
  path: string;
  role: "source" | "test";
  isRouteFile: boolean;
  exports: SymbolExport[];
  imports: SymbolImport[];
  calls: SymbolCall[];
}

interface PackageEntryPoint {
  name: string;
  directory: string;
  entryFile: string;
}

export function analyzeSymbolImpacts(rootDir: string, changedSourceFiles: FileChange[]): SymbolImpactAnalysis {
  const parsedFiles = parseRepoSymbols(rootDir);
  const graph = createSymbolImpactGraph(parsedFiles);
  const graphWithArtifact = persistSymbolImpactGraph(rootDir, graph);
  const pythonAnalysis = analyzePythonImpactAdapter(rootDir, changedSourceFiles);
  const additionalFragments = [createRemixImpactGraphFragment(rootDir), pythonAnalysis.fragment].filter(
    (fragment): fragment is NonNullable<typeof fragment> => fragment !== undefined
  );
  const impactGraph = createJsImpactGraphAdapterResult({
    rootDir,
    symbolGraph: graphWithArtifact,
    routeFiles: parsedFiles.filter((file) => file.isRouteFile).map((file) => file.path),
    additionalFragments
  });
  const impacts = findSymbolImpacts({
    rootDir,
    changedSourceFiles,
    graph: graphWithArtifact,
    parsedFiles
  });

  return {
    graph: graphWithArtifact,
    graphSummary: summarizeSymbolImpactGraph(graphWithArtifact),
    impactGraph: impactGraph.graph,
    impactGraphSummary: impactGraph.summary,
    impacts: [...impacts, ...pythonAnalysis.impacts],
    impactedRoutes: pythonAnalysis.impactedRoutes,
    recommendedTests: [...recommendedTestsForImpacts(impacts), ...pythonAnalysis.recommendedTests]
  };
}

export function summarizeSymbolImpactGraph(graph: SymbolImpactGraph): SymbolImpactGraphSummary {
  return {
    schemaVersion: graph.schemaVersion,
    artifactPath: graph.artifactPath,
    fileCount: graph.files.length,
    edgeCount: graph.edges.length
  };
}

function parseRepoSymbols(rootDir: string): ParsedFile[] {
  const repoFiles = listRepoFiles(rootDir).map((file) => normalizePath(file));
  const sourceFiles = repoFiles.filter(isJsTsSourcePath).sort((left, right) => left.localeCompare(right));
  const repoSourceSet = new Set(sourceFiles);
  const packageEntryPoints = collectPackageEntryPoints(rootDir, repoFiles, repoSourceSet);
  const cached = readCachedAnalyzerArtifacts({
    rootDir,
    files: sourceFiles,
    requireSymbols: true,
    parse: (path, content) => {
      const parsed = parseFileSymbols(content);
      return {
        exports: parsed.exports,
        imports: parsed.imports,
        calls: parsed.calls,
        localImportSpecifiers: extractLocalImportSpecifiers(content),
        isRouteFile: detectRoutesForFile(path, content).length > 0,
        symbolsComplete: true
      };
    }
  });

  return cached.files.map((file) => ({
    path: file.path,
    role: file.role,
    isRouteFile: file.isRouteFile,
    exports: file.exports,
    imports: file.imports.map((item) => ({
      ...item,
      sourceFile: resolveImportSpecifier(file.path, item.source, repoSourceSet, packageEntryPoints)
    })),
    calls: file.calls
  }));
}

function isJsTsSourcePath(path: string): boolean {
  return isSourcePath(path) && SOURCE_EXTENSION_CANDIDATES.includes(extname(path).toLowerCase());
}

function createSymbolImpactGraph(parsedFiles: ParsedFile[]): SymbolImpactGraph {
  const files: SymbolGraphFile[] = parsedFiles.map((file) => ({
    path: file.path,
    role: file.role,
    exports: sortExports(file.exports),
    imports: sortImports(file.imports),
    calls: sortCalls(file.calls)
  }));
  const edges = sortEdges(createSymbolEdges(parsedFiles));

  return {
    schemaVersion: 1,
    artifactPath: SYMBOL_IMPACT_GRAPH_PATH,
    files,
    edges
  };
}

function persistSymbolImpactGraph(rootDir: string, graph: SymbolImpactGraph): SymbolImpactGraph {
  const artifactPath = SYMBOL_IMPACT_GRAPH_PATH;
  const graphWithArtifact = {
    ...graph,
    artifactPath
  };
  const fullPath = resolveInsideRoot(rootDir, artifactPath);
  if (!fullPath) {
    return {
      ...graph,
      artifactPath: undefined
    };
  }

  try {
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, `${JSON.stringify(graphWithArtifact, null, 2)}\n`, "utf8");
  } catch {
    return {
      ...graph,
      artifactPath: undefined
    };
  }

  return graphWithArtifact;
}

function parseFileSymbols(content: string): Pick<ParsedFile, "exports" | "imports" | "calls"> {
  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });
    const exports: SymbolExport[] = [];
    const imports: SymbolImport[] = [];
    const calls: SymbolCall[] = [];

    walk(ast, (node) => {
      addImportSymbols(node, imports);
      addExportSymbols(node, exports, imports);
      addCallSymbols(node, calls);
    });

    return {
      exports: dedupeExports(exports),
      imports: dedupeImports(imports),
      calls: dedupeCalls(calls)
    };
  } catch {
    return {
      exports: [],
      imports: [],
      calls: []
    };
  }
}

function addImportSymbols(node: AstNode, imports: SymbolImport[]): void {
  if (getNodeType(node) !== "ImportDeclaration") {
    return;
  }

  const source = readStringValue(node.source);
  const loc = readNodeLoc(node);
  if (!source || !loc) {
    return;
  }

  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  if (specifiers.length === 0) {
    imports.push({
      source,
      sourceSymbol: "*",
      localName: "*",
      kind: "side-effect",
      line: loc.start.line
    });
    return;
  }

  for (const specifier of specifiers) {
    const type = getNodeType(specifier);
    const localName = readName((specifier as AstNode).local) ?? "*";
    if (type === "ImportSpecifier") {
      imports.push({
        source,
        sourceSymbol: readImportSpecifierName((specifier as AstNode).imported) ?? localName,
        localName,
        kind: "named",
        line: loc.start.line
      });
    } else if (type === "ImportDefaultSpecifier") {
      imports.push({
        source,
        sourceSymbol: "default",
        localName,
        kind: "default",
        line: loc.start.line
      });
    } else if (type === "ImportNamespaceSpecifier") {
      imports.push({
        source,
        sourceSymbol: "*",
        localName,
        kind: "namespace",
        line: loc.start.line
      });
    }
  }
}

function addExportSymbols(node: AstNode, exports: SymbolExport[], imports: SymbolImport[]): void {
  const type = getNodeType(node);
  const loc = readNodeLoc(node);
  if (!loc) {
    return;
  }

  if (type === "ExportDefaultDeclaration") {
    exports.push({
      name: "default",
      kind: "default",
      line: loc.start.line,
      endLine: loc.end.line
    });
    return;
  }

  if (type === "ExportAllDeclaration") {
    const source = readStringValue(node.source);
    if (!source) {
      return;
    }

    exports.push({
      name: "*",
      kind: "reexport",
      line: loc.start.line,
      endLine: loc.end.line
    });
    imports.push({
      source,
      sourceSymbol: "*",
      localName: "*",
      kind: "reexport",
      line: loc.start.line
    });
    return;
  }

  if (type !== "ExportNamedDeclaration") {
    return;
  }

  const declarationExports = exportSymbolsFromDeclaration(node.declaration, loc);
  exports.push(...declarationExports);

  const source = readStringValue(node.source);
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  for (const specifier of specifiers) {
    const exportedName = readExportedName(specifier);
    const localName = readLocalSpecifierName(specifier);
    if (!exportedName || !localName) {
      continue;
    }

    exports.push({
      name: exportedName,
      kind: source ? "reexport" : "named",
      line: loc.start.line,
      endLine: loc.end.line
    });

    if (source) {
      imports.push({
        source,
        sourceSymbol: localName,
        localName: exportedName,
        kind: "reexport",
        line: loc.start.line
      });
    }
  }
}

function addCallSymbols(node: AstNode, calls: SymbolCall[]): void {
  if (getNodeType(node) !== "CallExpression") {
    return;
  }

  const loc = readNodeLoc(node);
  const callee = readCalleeName(node.callee);
  if (!loc || !callee) {
    return;
  }

  calls.push({
    callee,
    line: loc.start.line
  });
}

function exportSymbolsFromDeclaration(declaration: unknown, exportLoc: SourceLocation): SymbolExport[] {
  if (!declaration || typeof declaration !== "object") {
    return [];
  }

  const node = declaration as AstNode;
  const loc = readNodeLoc(node) ?? exportLoc;
  const type = getNodeType(node);
  if (
    type === "FunctionDeclaration" ||
    type === "ClassDeclaration" ||
    type === "TSInterfaceDeclaration" ||
    type === "TSTypeAliasDeclaration" ||
    type === "TSEnumDeclaration"
  ) {
    const name = readName(node.id);
    return name
      ? [
          {
            name,
            kind: "named",
            line: loc.start.line,
            endLine: loc.end.line
          }
        ]
      : [];
  }

  if (type !== "VariableDeclaration") {
    return [];
  }

  const declarations = Array.isArray(node.declarations) ? node.declarations : [];
  return declarations.flatMap((declarator) =>
    bindingNames((declarator as AstNode).id).map((name) => ({
      name,
      kind: "named" as const,
      line: loc.start.line,
      endLine: loc.end.line
    }))
  );
}

function createSymbolEdges(parsedFiles: ParsedFile[]): SymbolImportEdge[] {
  const edges: SymbolImportEdge[] = [];

  for (const file of parsedFiles) {
    for (const item of file.imports) {
      if (!item.sourceFile) {
        continue;
      }

      edges.push({
        sourceFile: item.sourceFile,
        sourceSymbol: item.sourceSymbol,
        importerFile: file.path,
        importedAs: item.localName,
        importKind: item.kind,
        line: item.line
      });
    }
  }

  return edges;
}

function findSymbolImpacts(input: {
  rootDir: string;
  changedSourceFiles: FileChange[];
  graph: SymbolImpactGraph;
  parsedFiles: ParsedFile[];
}): SymbolImpact[] {
  const filesByPath = new Map(input.graph.files.map((file) => [file.path, file]));
  const routeFiles = new Set(input.parsedFiles.filter((file) => file.isRouteFile).map((file) => file.path));

  return input.changedSourceFiles.flatMap((change) => {
    const file = filesByPath.get(normalizePath(change.path));
    if (!file) {
      return [];
    }

    return touchedExports(file, change)
      .filter((item) => item.name !== "*")
      .map((item) => {
        const reachability = findReachableSymbolImporters(input.graph, file.path, item.name);
        const importerFiles = [...reachability.importerFiles].sort((left, right) => left.localeCompare(right));
        const routeImporterFiles = importerFiles
          .filter((path) => routeFiles.has(path))
          .sort((left, right) => left.localeCompare(right));
        const likelyTests = importerFiles.filter(isTestPath).sort((left, right) => left.localeCompare(right));

        return {
          file: file.path,
          symbol: item.name,
          exportKind: item.kind,
          line: item.line,
          importerFiles,
          routeFiles: routeImporterFiles,
          likelyTests,
          reasons: [...reachability.reasons].sort((left, right) => left.localeCompare(right)).slice(0, 12)
        };
      })
      .filter((impact) => impact.importerFiles.length > 0 || impact.routeFiles.length > 0 || impact.likelyTests.length > 0);
  });
}

function touchedExports(file: SymbolGraphFile, change: FileChange): SymbolExport[] {
  const changedLines = new Set(change.addedLines.map((line) => line.line));
  if (changedLines.size === 0) {
    return file.exports;
  }

  const touched = file.exports.filter((item) =>
    [...changedLines].some((line) => line >= item.line && line <= item.endLine)
  );
  return touched.length > 0 ? touched : file.exports;
}

function findReachableSymbolImporters(
  graph: SymbolImpactGraph,
  sourceFile: string,
  sourceSymbol: string
): { importerFiles: Set<string>; reasons: Set<string> } {
  const importers = new Set<string>();
  const reasons = new Set<string>();
  const filesByPath = new Map(graph.files.map((file) => [file.path, file]));
  const queue: Array<{ file: string; symbol: string; depth: number; chain: string[] }> = [
    { file: sourceFile, symbol: sourceSymbol, depth: 0, chain: [`${sourceFile}#${sourceSymbol}`] }
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const visitedKey = `${current.file}\u0000${current.symbol}`;
    if (visited.has(visitedKey) || current.depth > MAX_SYMBOL_PROPAGATION_DEPTH) {
      continue;
    }
    visited.add(visitedKey);

    for (const edge of matchingEdges(graph.edges, current.file, current.symbol)) {
      importers.add(edge.importerFile);
      const nextSymbol = edge.importedAs === "*" ? current.symbol : edge.importedAs;
      const nextLabel = `${edge.importerFile}#${nextSymbol}`;
      reasons.add(`${[...current.chain, nextLabel].join(" -> ")} (${edge.importKind} import)`);

      if (canPropagateThroughImport(filesByPath.get(edge.importerFile), nextSymbol, edge.importKind)) {
        queue.push({
          file: edge.importerFile,
          symbol: nextSymbol,
          depth: current.depth + 1,
          chain: [...current.chain, nextLabel]
        });
      }
    }
  }

  return {
    importerFiles: importers,
    reasons
  };
}

function matchingEdges(edges: SymbolImportEdge[], sourceFile: string, sourceSymbol: string): SymbolImportEdge[] {
  return edges
    .filter(
      (edge) =>
        edge.sourceFile === sourceFile &&
        (edge.sourceSymbol === sourceSymbol || edge.sourceSymbol === "*" || sourceSymbol === "*")
    )
    .sort((left, right) => {
      const fileCompare = left.importerFile.localeCompare(right.importerFile);
      return fileCompare === 0 ? left.importedAs.localeCompare(right.importedAs) : fileCompare;
    });
}

function canPropagateThroughImport(
  file: SymbolGraphFile | undefined,
  importedSymbol: string,
  importKind: SymbolImport["kind"]
): boolean {
  if (!file || file.role === "test") {
    return false;
  }

  return importKind === "reexport" || file.exports.some((item) => item.name === importedSymbol || item.name === "*");
}

function recommendedTestsForImpacts(impacts: SymbolImpact[]): string[] {
  const recommendations = new Set<string>();
  for (const impact of impacts) {
    for (const routeFile of impact.routeFiles) {
      recommendations.add(`Add or run tests covering ${routeFile} because it imports ${impact.file}#${impact.symbol}`);
    }
    for (const testFile of impact.likelyTests) {
      recommendations.add(`Re-run likely impacted test ${testFile} for ${impact.file}#${impact.symbol}`);
    }
  }

  return [...recommendations].sort((left, right) => left.localeCompare(right));
}

function collectPackageEntryPoints(
  rootDir: string,
  repoFiles: string[],
  repoSourceSet: Set<string>
): Map<string, PackageEntryPoint> {
  const entries = new Map<string, PackageEntryPoint>();

  for (const packageJsonPath of repoFiles.filter((file) => file.endsWith("package.json")).sort()) {
    const content = readRepoFile(rootDir, packageJsonPath);
    if (!content) {
      continue;
    }

    const name = readPackageName(content);
    if (!name) {
      continue;
    }

    const directory = normalizePath(dirname(packageJsonPath));
    const entryFile = resolvePackageEntryFile(directory, content, repoSourceSet);
    if (entryFile) {
      entries.set(name, {
        name,
        directory,
        entryFile
      });
    }
  }

  return entries;
}

function resolveImportSpecifier(
  importerPath: string,
  specifier: string,
  repoSourceSet: Set<string>,
  packageEntryPoints: Map<string, PackageEntryPoint>
): string | undefined {
  if (specifier.startsWith(".")) {
    return resolveLocalImportSpecifier(importerPath, specifier, repoSourceSet);
  }

  return resolvePackageImportSpecifier(specifier, repoSourceSet, packageEntryPoints);
}

function resolvePackageImportSpecifier(
  specifier: string,
  repoSourceSet: Set<string>,
  packageEntryPoints: Map<string, PackageEntryPoint>
): string | undefined {
  const packageName = packageNameFromSpecifier(specifier);
  if (!packageName) {
    return undefined;
  }

  const entry = packageEntryPoints.get(packageName);
  if (!entry) {
    return undefined;
  }

  const subpath = specifier === packageName ? "" : specifier.slice(packageName.length + 1);
  if (!subpath) {
    return entry.entryFile;
  }

  return resolveSourceCandidate(normalizePath(join(entry.directory, subpath)), repoSourceSet);
}

function packageNameFromSpecifier(specifier: string): string | undefined {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  }

  return parts[0];
}

function resolvePackageEntryFile(directory: string, packageJsonContent: string, repoSourceSet: Set<string>): string | undefined {
  const packageFields = readPackageEntryFields(packageJsonContent);
  for (const field of packageFields) {
    const resolved = resolveSourceCandidate(normalizePath(join(directory, field)), repoSourceSet);
    if (resolved) {
      return resolved;
    }
  }

  for (const candidate of ["src/index", "index"]) {
    const resolved = resolveSourceCandidate(normalizePath(join(directory, candidate)), repoSourceSet);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

function resolveSourceCandidate(candidate: string, repoSourceSet: Set<string>): string | undefined {
  const normalized = normalizePath(candidate);
  const candidates = new Set<string>([normalized]);

  if (!extname(normalized)) {
    for (const extension of SOURCE_EXTENSION_CANDIDATES) {
      candidates.add(`${normalized}${extension}`);
      candidates.add(`${normalized}/index${extension}`);
    }
  }

  for (const item of candidates) {
    if (repoSourceSet.has(item)) {
      return item;
    }
  }

  return undefined;
}

function readPackageName(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

function readPackageEntryFields(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as {
      source?: unknown;
      module?: unknown;
      main?: unknown;
      types?: unknown;
    };
    return [parsed.source, parsed.module, parsed.main, parsed.types].filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function readRepoFile(rootDir: string, path: string): string | undefined {
  const fullPath = resolveInsideRoot(rootDir, path);
  if (!fullPath) {
    return undefined;
  }

  try {
    return readFileSync(fullPath, "utf8");
  } catch {
    return undefined;
  }
}

function resolveInsideRoot(rootDir: string, repoPath: string): string | undefined {
  const rootPath = resolve(rootDir);
  const fullPath = resolve(rootPath, repoPath);
  const relativePath = relative(rootPath, fullPath);
  return relativePath.startsWith("..") || isAbsolute(relativePath) ? undefined : fullPath;
}

interface SourceLocation {
  start: {
    line: number;
  };
  end: {
    line: number;
  };
}

function readNodeLoc(node: unknown): SourceLocation | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }

  const loc = (node as { loc?: unknown }).loc;
  if (!loc || typeof loc !== "object") {
    return undefined;
  }

  const candidate = loc as {
    start?: { line?: unknown };
    end?: { line?: unknown };
  };
  return typeof candidate.start?.line === "number" && typeof candidate.end?.line === "number"
    ? {
        start: { line: candidate.start.line },
        end: { line: candidate.end.line }
      }
    : undefined;
}

function readStringValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { value?: unknown };
  return typeof candidate.value === "string" ? candidate.value : undefined;
}

function readName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { name?: unknown };
  return typeof candidate.name === "string" ? candidate.name : undefined;
}

function readImportSpecifierName(value: unknown): string | undefined {
  return readName(value) ?? readStringValue(value);
}

function readExportedName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return readName((value as AstNode).exported) ?? readStringValue((value as AstNode).exported);
}

function readLocalSpecifierName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return readName((value as AstNode).local) ?? readStringValue((value as AstNode).local);
}

function readCalleeName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const node = value as AstNode;
  const type = getNodeType(node);
  if (type === "Identifier") {
    return readName(node);
  }

  if (type === "MemberExpression" || type === "OptionalMemberExpression") {
    const objectName = readCalleeName(node.object);
    const propertyName = readName(node.property) ?? readStringValue(node.property);
    if (objectName && propertyName) {
      return `${objectName}.${propertyName}`;
    }
    return propertyName;
  }

  return undefined;
}

function bindingNames(node: unknown): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const typedNode = node as AstNode;
  const type = getNodeType(typedNode);
  if (type === "Identifier") {
    const name = readName(typedNode);
    return name ? [name] : [];
  }

  if (type === "ObjectPattern") {
    const properties = Array.isArray(typedNode.properties) ? typedNode.properties : [];
    return properties.flatMap((property) => bindingNames((property as AstNode).value ?? (property as AstNode).argument));
  }

  if (type === "ArrayPattern") {
    const elements = Array.isArray(typedNode.elements) ? typedNode.elements : [];
    return elements.flatMap(bindingNames);
  }

  if (type === "RestElement" || type === "AssignmentPattern") {
    return bindingNames(typedNode.argument ?? typedNode.left);
  }

  return [];
}

function dedupeExports(exports: SymbolExport[]): SymbolExport[] {
  const byKey = new Map<string, SymbolExport>();
  for (const item of exports) {
    byKey.set(`${item.name}\u0000${item.kind}\u0000${item.line}`, item);
  }

  return sortExports([...byKey.values()]);
}

function dedupeImports(imports: SymbolImport[]): SymbolImport[] {
  const byKey = new Map<string, SymbolImport>();
  for (const item of imports) {
    byKey.set(`${item.source}\u0000${item.sourceSymbol}\u0000${item.localName}\u0000${item.kind}\u0000${item.line}`, item);
  }

  return sortImports([...byKey.values()]);
}

function dedupeCalls(calls: SymbolCall[]): SymbolCall[] {
  const byKey = new Map<string, SymbolCall>();
  for (const item of calls) {
    byKey.set(`${item.callee}\u0000${item.line}`, item);
  }

  return sortCalls([...byKey.values()]);
}

function sortExports(exports: SymbolExport[]): SymbolExport[] {
  return [...exports].sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name);
    return nameCompare === 0 ? left.line - right.line : nameCompare;
  });
}

function sortImports(imports: SymbolImport[]): SymbolImport[] {
  return [...imports].sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }
    const symbolCompare = left.sourceSymbol.localeCompare(right.sourceSymbol);
    return symbolCompare === 0 ? left.localName.localeCompare(right.localName) : symbolCompare;
  });
}

function sortCalls(calls: SymbolCall[]): SymbolCall[] {
  return [...calls].sort((left, right) => {
    const calleeCompare = left.callee.localeCompare(right.callee);
    return calleeCompare === 0 ? left.line - right.line : calleeCompare;
  });
}

function sortEdges(edges: SymbolImportEdge[]): SymbolImportEdge[] {
  return [...edges].sort((left, right) => {
    const sourceCompare = left.sourceFile.localeCompare(right.sourceFile);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }
    const symbolCompare = left.sourceSymbol.localeCompare(right.sourceSymbol);
    if (symbolCompare !== 0) {
      return symbolCompare;
    }
    const importerCompare = left.importerFile.localeCompare(right.importerFile);
    return importerCompare === 0 ? left.importedAs.localeCompare(right.importedAs) : importerCompare;
  });
}
