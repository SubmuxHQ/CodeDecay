import { readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { parser as pythonParser } from "@lezer/python";
import type {
  FileChange,
  ImpactGraphFragment,
  ImpactGraphFragmentEdge,
  ImpactGraphFragmentNode,
  ImpactedRoute,
  SymbolExport,
  SymbolImpact,
  SymbolImport,
  SymbolImportEdge
} from "@submuxhq/codedecay-core";
import { isDocsPath, isSourcePath, isTestPath } from "../classifiers/paths";
import { listRepoFiles } from "../files/repo";
import { normalizePath } from "../imports/graph/path";
import { HTTP_METHODS, routeImpact } from "../routes/shared";

const ADAPTER_ID = "codedecay-python-lezer";
const ADAPTER_VERSION = "1.0.0";
const SOURCE_TOOL = "@lezer/python";
const SOURCE_TOOL_VERSION = "1.1.19";
const MAX_SYMBOL_PROPAGATION_DEPTH = 4;
const STATIC_TEST_IMPORT_LIMITATION =
  "A static test import does not prove the Python symbol executed or that assertions cover its behavior.";
const ADAPTER_LIMITATIONS = [
  "Python impact evidence uses the @lezer/python grammar and conservative module-to-file resolution.",
  "Dynamic imports, dependency injection, decorators without literal routes, and framework route registries are not resolved.",
  "Static test imports do not prove execution or assertion quality."
];

export interface PythonImpactAdapterAnalysis {
  fragment?: ImpactGraphFragment | undefined;
  impacts: SymbolImpact[];
  impactedRoutes: ImpactedRoute[];
  recommendedTests: string[];
}

interface ParsedPythonFile {
  path: string;
  role: "source" | "test";
  exports: SymbolExport[];
  imports: SymbolImport[];
  routes: PythonRoute[];
}

interface PythonRoute {
  method: string;
  route: string;
  line: number;
}

interface LezerNodeRef {
  name: string;
  from: number;
  to: number;
  node: {
    getChild(name: string): { from: number; to: number } | null;
  };
}

export function analyzePythonImpactAdapter(
  rootDir: string,
  changedSourceFiles: FileChange[]
): PythonImpactAdapterAnalysis {
  const parsedFiles = parsePythonFiles(rootDir);
  if (parsedFiles.length === 0) {
    return {
      impacts: [],
      impactedRoutes: [],
      recommendedTests: []
    };
  }

  const repoPythonSet = new Set(parsedFiles.map((file) => file.path));
  const resolvedFiles = parsedFiles.map((file) => ({
    ...file,
    imports: file.imports.map((item) => ({
      ...item,
      sourceFile: resolvePythonImport(item, file.path, repoPythonSet)
    }))
  }));
  const edges = createSymbolEdges(resolvedFiles);
  const impacts = findPythonSymbolImpacts({
    changedSourceFiles,
    files: resolvedFiles,
    edges
  });

  return {
    fragment: createPythonImpactGraphFragment(resolvedFiles, edges),
    impacts,
    impactedRoutes: impactedRoutesForImpacts(resolvedFiles, impacts),
    recommendedTests: recommendedTestsForImpacts(impacts)
  };
}

function parsePythonFiles(rootDir: string): ParsedPythonFile[] {
  return listRepoFiles(rootDir)
    .map((file) => normalizePath(file))
    .filter((file) => extname(file).toLowerCase() === ".py" && isSourcePath(file) && !isDocsPath(file))
    .sort((left, right) => left.localeCompare(right))
    .flatMap((file) => {
      const content = readRepoFile(rootDir, file);
      return content === undefined ? [] : [parsePythonFile(file, content)];
    });
}

function parsePythonFile(path: string, content: string): ParsedPythonFile {
  const exports: SymbolExport[] = [];
  const imports: SymbolImport[] = [];
  const routes: PythonRoute[] = [];
  const lineStarts = createLineStarts(content);
  const tree = pythonParser.parse(content);

  tree.iterate({
    enter(node) {
      if (node.name === "FunctionDefinition" || node.name === "ClassDefinition") {
        const name = firstChildText(node, "VariableName", content);
        if (!name) {
          return;
        }
        exports.push({
          name,
          kind: "named",
          line: lineForOffset(lineStarts, node.from),
          endLine: lineForOffset(lineStarts, Math.max(node.from, node.to - 1))
        });
        return;
      }

      if (node.name === "ImportStatement") {
        imports.push(...parseImportStatement(content.slice(node.from, node.to), lineForOffset(lineStarts, node.from)));
        return;
      }

      if (node.name === "Decorator") {
        const route = parseRouteDecorator(content.slice(node.from, node.to), lineForOffset(lineStarts, node.from));
        if (route) {
          routes.push(route);
        }
      }
    }
  });

  return {
    path,
    role: isTestPath(path) ? "test" : "source",
    exports: dedupeExports(exports),
    imports: dedupeImports(imports),
    routes: dedupeRoutes(routes)
  };
}

function parseImportStatement(text: string, line: number): SymbolImport[] {
  const trimmed = text.trim().replace(/\s+#.*$/, "");
  const fromImport = /^from\s+([.\w]+)\s+import\s+(.+)$/s.exec(trimmed);
  if (fromImport?.[1] && fromImport[2]) {
    const source = fromImport[1];
    return parseImportedNames(fromImport[2]).map((item) => ({
      source,
      sourceSymbol: item.sourceSymbol,
      localName: item.localName,
      kind: "named",
      line
    }));
  }

  const directImport = /^import\s+(.+)$/s.exec(trimmed);
  if (!directImport?.[1]) {
    return [];
  }

  return directImport[1].split(",").flatMap((part) => {
    const item = parseAliasedName(part);
    if (!item) {
      return [];
    }
    return [
      {
        source: item.sourceSymbol,
        sourceSymbol: "*",
        localName: item.localName,
        kind: "namespace" as const,
        line
      }
    ];
  });
}

function parseImportedNames(text: string): Array<{ sourceSymbol: string; localName: string }> {
  return text
    .replace(/[()]/g, "")
    .split(",")
    .flatMap((part) => {
      const item = parseAliasedName(part);
      return item ? [item] : [];
    });
}

function parseAliasedName(text: string): { sourceSymbol: string; localName: string } | undefined {
  const match = /^([.\w*]+)(?:\s+as\s+(\w+))?$/.exec(text.trim());
  if (!match?.[1]) {
    return undefined;
  }
  const sourceSymbol = match[1];
  return {
    sourceSymbol,
    localName: match[2] ?? sourceSymbol.split(".").at(-1) ?? sourceSymbol
  };
}

function parseRouteDecorator(text: string, line: number): PythonRoute | undefined {
  const match = /@[\w.]+\.(get|post|put|patch|delete|head|options)\s*\(\s*(['"])([^'"]+)\2/i.exec(text);
  if (!match?.[1] || !match[3]) {
    return undefined;
  }
  const method = match[1].toUpperCase();
  if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
    return undefined;
  }

  return {
    method,
    route: match[3],
    line
  };
}

function createSymbolEdges(parsedFiles: ParsedPythonFile[]): SymbolImportEdge[] {
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

  return edges.sort(compareSymbolImportEdges);
}

function findPythonSymbolImpacts(input: {
  changedSourceFiles: FileChange[];
  files: ParsedPythonFile[];
  edges: SymbolImportEdge[];
}): SymbolImpact[] {
  const filesByPath = new Map(input.files.map((file) => [file.path, file]));
  const routeFiles = new Set(input.files.filter((file) => file.routes.length > 0).map((file) => file.path));

  return input.changedSourceFiles
    .filter((change) => extname(change.path).toLowerCase() === ".py" && !isTestPath(change.path) && !isDocsPath(change.path))
    .flatMap((change) => {
      const file = filesByPath.get(normalizePath(change.path));
      if (!file) {
        return [];
      }

      return touchedExports(file, change)
        .filter((item) => item.name !== "*")
        .map((item) => {
          const reachability = findReachableSymbolImporters(input.edges, input.files, file.path, item.name);
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

function findReachableSymbolImporters(
  edges: SymbolImportEdge[],
  files: ParsedPythonFile[],
  sourceFile: string,
  sourceSymbol: string
): { importerFiles: Set<string>; reasons: Set<string> } {
  const importers = new Set<string>();
  const reasons = new Set<string>();
  const filesByPath = new Map(files.map((file) => [file.path, file]));
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

    for (const edge of matchingEdges(edges, current.file, current.symbol)) {
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
    .sort(compareSymbolImportEdges);
}

function canPropagateThroughImport(
  file: ParsedPythonFile | undefined,
  importedSymbol: string,
  importKind: SymbolImport["kind"]
): boolean {
  if (!file || file.role === "test") {
    return false;
  }

  return importKind === "reexport" || file.exports.some((item) => item.name === importedSymbol || item.name === "*");
}

function touchedExports(file: ParsedPythonFile, change: FileChange): SymbolExport[] {
  const changedLines = new Set(change.addedLines.map((line) => line.line));
  if (changedLines.size === 0) {
    return file.exports;
  }

  const touched = file.exports.filter((item) =>
    [...changedLines].some((line) => line >= item.line && line <= item.endLine)
  );
  return touched.length > 0 ? touched : file.exports;
}

function impactedRoutesForImpacts(files: ParsedPythonFile[], impacts: SymbolImpact[]): ImpactedRoute[] {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const routes: ImpactedRoute[] = [];

  for (const impact of impacts) {
    for (const routeFile of impact.routeFiles) {
      const file = filesByPath.get(routeFile);
      if (!file) {
        continue;
      }
      for (const route of file.routes) {
        routes.push(
          routeImpact({
            framework: "fastapi",
            kind: "api-route",
            route: route.route,
            methods: [route.method],
            file: file.path,
            risk: "medium",
            reasons: [`Python route imports changed symbol ${impact.file}#${impact.symbol}`]
          })
        );
      }
    }
  }

  return routes;
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

function createPythonImpactGraphFragment(
  parsedFiles: ParsedPythonFile[],
  edges: SymbolImportEdge[]
): ImpactGraphFragment {
  return {
    schemaVersion: 1,
    adapter: {
      id: ADAPTER_ID,
      version: ADAPTER_VERSION,
      sourceTool: SOURCE_TOOL,
      sourceToolVersion: SOURCE_TOOL_VERSION,
      status: "available",
      capabilities: {
        nodeKinds: ["file", "api", "route", "symbol", "test"],
        edgeKinds: ["contains", "imports", "serves", "tests"]
      },
      limitations: [...ADAPTER_LIMITATIONS]
    },
    nodes: createNodes(parsedFiles, edges),
    edges: [
      ...createContainmentEdges(parsedFiles),
      ...edges.map((edge) => createImportEdge(edge, parsedFiles)),
      ...createRouteEdges(parsedFiles)
    ],
    limitations: []
  };
}

function createNodes(parsedFiles: ParsedPythonFile[], edges: SymbolImportEdge[]): ImpactGraphFragmentNode[] {
  const nodes = new Map<string, ImpactGraphFragmentNode>();

  for (const file of parsedFiles) {
    if (file.exports.length === 0 && file.imports.length === 0 && file.routes.length === 0) {
      continue;
    }
    nodes.set(fileNodeId(file.path), {
      id: fileNodeId(file.path),
      kind: file.role === "test" ? "test" : file.routes.length > 0 ? "api" : "file",
      label: file.path,
      location: {
        file: file.path
      }
    });
    for (const exported of file.exports) {
      addSymbolNode(nodes, file.path, exported.name, exported.line);
    }
    for (const route of file.routes) {
      nodes.set(routeNodeId(file.path, route), {
        id: routeNodeId(file.path, route),
        kind: "route",
        label: `${route.method} ${route.route}`,
        location: {
          file: file.path,
          line: route.line
        }
      });
    }
  }

  for (const edge of edges) {
    addSymbolNode(nodes, edge.sourceFile, edge.sourceSymbol, findExportLine(parsedFiles, edge));
    if (!nodes.has(fileNodeId(edge.importerFile))) {
      nodes.set(fileNodeId(edge.importerFile), {
        id: fileNodeId(edge.importerFile),
        kind: isTestPath(edge.importerFile) ? "test" : "file",
        label: edge.importerFile,
        location: {
          file: edge.importerFile
        }
      });
    }
  }

  return [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function addSymbolNode(
  nodes: Map<string, ImpactGraphFragmentNode>,
  file: string,
  symbol: string,
  line: number | undefined
): void {
  const id = symbolNodeId(file, symbol);
  if (nodes.has(id)) {
    return;
  }

  nodes.set(id, {
    id,
    kind: "symbol",
    label: symbol,
    location: {
      file,
      line
    }
  });
}

function createContainmentEdges(parsedFiles: ParsedPythonFile[]): ImpactGraphFragmentEdge[] {
  return parsedFiles.flatMap((file) =>
    file.exports.map((exported) => ({
      id: `contains:${file.path}#${exported.name}:${exported.line}`,
      from: fileNodeId(file.path),
      to: symbolNodeId(file.path, exported.name),
      kind: "contains" as const,
      confidence: "direct" as const,
      evidence: `${SOURCE_TOOL} parsed ${exported.name} as a Python symbol in ${file.path}.`,
      sourceTool: SOURCE_TOOL,
      sourceToolVersion: SOURCE_TOOL_VERSION,
      location: {
        file: file.path,
        line: exported.line
      },
      limitations: []
    }))
  );
}

function createImportEdge(
  edge: SymbolImportEdge,
  parsedFiles: ParsedPythonFile[]
): ImpactGraphFragmentEdge {
  const importerRole = parsedFiles.find((file) => file.path === edge.importerFile)?.role;

  return {
    id: [
      importerRole === "test" ? "tests" : "imports",
      edge.importerFile,
      edge.sourceFile,
      edge.sourceSymbol,
      edge.importedAs,
      edge.line
    ].join(":"),
    from: fileNodeId(edge.importerFile),
    to: symbolNodeId(edge.sourceFile, edge.sourceSymbol),
    kind: importerRole === "test" ? "tests" : "imports",
    confidence: "direct",
    evidence: `${SOURCE_TOOL} parsed a Python import and CodeDecay resolved ${edge.sourceFile}#${edge.sourceSymbol} from ${edge.importerFile}.`,
    sourceTool: SOURCE_TOOL,
    sourceToolVersion: SOURCE_TOOL_VERSION,
    location: {
      file: edge.importerFile,
      line: edge.line
    },
    limitations: importerRole === "test" ? [STATIC_TEST_IMPORT_LIMITATION] : []
  };
}

function createRouteEdges(parsedFiles: ParsedPythonFile[]): ImpactGraphFragmentEdge[] {
  return parsedFiles.flatMap((file) =>
    file.routes.map((route) => ({
      id: `serves:${file.path}:${route.method}:${route.route}:${route.line}`,
      from: fileNodeId(file.path),
      to: routeNodeId(file.path, route),
      kind: "serves" as const,
      confidence: "direct" as const,
      evidence: `${SOURCE_TOOL} parsed ${route.method} ${route.route} as a Python route decorator in ${file.path}.`,
      sourceTool: SOURCE_TOOL,
      sourceToolVersion: SOURCE_TOOL_VERSION,
      location: {
        file: file.path,
        line: route.line
      },
      limitations: [
        "Route decorators are static evidence only; CodeDecay did not execute the Python app or inspect runtime route registration."
      ]
    }))
  );
}

function resolvePythonImport(
  item: SymbolImport,
  importerFile: string,
  repoPythonSet: Set<string>
): string | undefined {
  if (item.source.startsWith(".")) {
    return resolveRelativePythonImport(item, importerFile, repoPythonSet);
  }

  return resolvePythonModule(item.source, repoPythonSet) ?? resolvePythonModule(`${item.source}.${item.sourceSymbol}`, repoPythonSet);
}

function resolveRelativePythonImport(
  item: SymbolImport,
  importerFile: string,
  repoPythonSet: Set<string>
): string | undefined {
  const leadingDots = item.source.match(/^\.+/)?.[0].length ?? 0;
  if (leadingDots === 0) {
    return undefined;
  }
  const parentParts = normalizePath(importerFile).split("/").slice(0, -1);
  const baseParts = parentParts.slice(0, Math.max(0, parentParts.length - leadingDots + 1));
  const moduleTail = item.source.slice(leadingDots);
  const moduleName = [...baseParts, ...moduleTail.split(".").filter(Boolean)].join(".");

  return resolvePythonModule(moduleName, repoPythonSet) ?? resolvePythonModule(`${moduleName}.${item.sourceSymbol}`, repoPythonSet);
}

function resolvePythonModule(moduleName: string, repoPythonSet: Set<string>): string | undefined {
  if (!moduleName || moduleName === "*") {
    return undefined;
  }
  const path = normalizePath(moduleName.replaceAll(".", "/"));
  const candidates = [`${path}.py`, `${path}/__init__.py`];

  return candidates.find((candidate) => repoPythonSet.has(candidate));
}

function findExportLine(files: ParsedPythonFile[], edge: SymbolImportEdge): number | undefined {
  return files
    .find((file) => file.path === edge.sourceFile)
    ?.exports.find((item) => item.name === edge.sourceSymbol || item.name === "*")?.line;
}

function firstChildText(node: LezerNodeRef, childName: string, content: string): string | undefined {
  const child = node.node.getChild(childName);
  return child ? content.slice(child.from, child.to) : undefined;
}

function createLineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineForOffset(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = starts[middle] ?? 0;
    if (candidate <= offset) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best + 1;
}

function dedupeExports(exports: SymbolExport[]): SymbolExport[] {
  const byKey = new Map<string, SymbolExport>();
  for (const item of exports) {
    byKey.set(`${item.name}\u0000${item.kind}\u0000${item.line}`, item);
  }

  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name) || left.line - right.line);
}

function dedupeImports(imports: SymbolImport[]): SymbolImport[] {
  const byKey = new Map<string, SymbolImport>();
  for (const item of imports) {
    byKey.set(`${item.source}\u0000${item.sourceSymbol}\u0000${item.localName}\u0000${item.kind}\u0000${item.line}`, item);
  }

  return [...byKey.values()].sort((left, right) => left.source.localeCompare(right.source) || left.localName.localeCompare(right.localName));
}

function dedupeRoutes(routes: PythonRoute[]): PythonRoute[] {
  const byKey = new Map<string, PythonRoute>();
  for (const route of routes) {
    byKey.set(`${route.method}\u0000${route.route}\u0000${route.line}`, route);
  }

  return [...byKey.values()].sort((left, right) => left.route.localeCompare(right.route) || left.method.localeCompare(right.method));
}

function compareSymbolImportEdges(left: SymbolImportEdge, right: SymbolImportEdge): number {
  return (
    left.sourceFile.localeCompare(right.sourceFile) ||
    left.sourceSymbol.localeCompare(right.sourceSymbol) ||
    left.importerFile.localeCompare(right.importerFile) ||
    left.importedAs.localeCompare(right.importedAs) ||
    left.line - right.line
  );
}

function fileNodeId(path: string): string {
  return `file:${path}`;
}

function symbolNodeId(path: string, symbol: string): string {
  return `symbol:${path}#${symbol}`;
}

function routeNodeId(path: string, route: PythonRoute): string {
  return `route:${path}#${route.method} ${route.route}`;
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
