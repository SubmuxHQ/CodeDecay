import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  normalizeImpactGraphFragments,
  summarizeImpactGraph,
  type ImpactGraph,
  type ImpactGraphFragment,
  type ImpactGraphFragmentEdge,
  type ImpactGraphFragmentNode,
  type ImpactGraphSummary,
  type SymbolGraphFile,
  type SymbolImpactGraph,
  type SymbolImportEdge
} from "@submuxhq/codedecay-core";

export const IMPACT_GRAPH_PATH = ".codedecay/local/impact-graph.json";

const ADAPTER_ID = "codedecay-js-babel-symbols";
const ADAPTER_VERSION = "1.0.0";
const SOURCE_TOOL = "@babel/parser";
const STATIC_TEST_IMPORT_LIMITATION =
  "A static test import does not prove the symbol executed or that assertions cover its behavior.";
const ADAPTER_LIMITATIONS = [
  "Call expressions are not connected to target symbols in this adapter version.",
  "Only JavaScript and TypeScript files parsed by @babel/parser are represented.",
  "Static import resolution does not resolve runtime dependency injection or dynamic imports."
];

export interface JsImpactGraphAdapterResult {
  graph: ImpactGraph;
  summary: ImpactGraphSummary;
}

export function createJsImpactGraphAdapterResult(input: {
  rootDir: string;
  symbolGraph: SymbolImpactGraph;
  routeFiles: string[];
  additionalFragments?: ImpactGraphFragment[] | undefined;
}): JsImpactGraphAdapterResult {
  const fragment = createJsImpactGraphFragment(input.symbolGraph, new Set(input.routeFiles));
  const normalized = normalizeImpactGraphFragments([fragment, ...(input.additionalFragments ?? [])]);
  const graph = persistImpactGraph(input.rootDir, normalized);

  return {
    graph,
    summary: summarizeImpactGraph(graph)
  };
}

function createJsImpactGraphFragment(
  symbolGraph: SymbolImpactGraph,
  routeFiles: Set<string>
): ImpactGraphFragment {
  const filesByPath = new Map(symbolGraph.files.map((file) => [file.path, file]));
  const nodes = createNodes(symbolGraph, routeFiles);
  const edges = [
    ...createContainmentEdges(symbolGraph.files),
    ...symbolGraph.edges.map((edge) => createImportEdge(edge, filesByPath))
  ];

  return {
    schemaVersion: 1,
    adapter: {
      id: ADAPTER_ID,
      version: ADAPTER_VERSION,
      sourceTool: SOURCE_TOOL,
      status: "available",
      capabilities: {
        nodeKinds: ["file", "route", "symbol", "test"],
        edgeKinds: ["contains", "imports", "tests"]
      },
      limitations: [...ADAPTER_LIMITATIONS]
    },
    nodes,
    edges,
    limitations: []
  };
}

function createNodes(symbolGraph: SymbolImpactGraph, routeFiles: Set<string>): ImpactGraphFragmentNode[] {
  const nodes = new Map<string, ImpactGraphFragmentNode>();

  for (const file of symbolGraph.files) {
    const fileId = fileNodeId(file.path);
    nodes.set(fileId, {
      id: fileId,
      kind: file.role === "test" ? "test" : routeFiles.has(file.path) ? "route" : "file",
      label: file.path,
      location: {
        file: file.path
      }
    });

    for (const exported of file.exports) {
      addSymbolNode(nodes, file.path, exported.name, exported.line);
    }
  }

  for (const edge of symbolGraph.edges) {
    addSymbolNode(nodes, edge.sourceFile, edge.sourceSymbol, findExportLine(symbolGraph.files, edge));
  }

  return [...nodes.values()];
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

function createContainmentEdges(files: SymbolGraphFile[]): ImpactGraphFragmentEdge[] {
  return files.flatMap((file) =>
    file.exports.map((exported) => ({
      id: `contains:${file.path}#${exported.name}:${exported.line}`,
      from: fileNodeId(file.path),
      to: symbolNodeId(file.path, exported.name),
      kind: "contains" as const,
      confidence: "direct" as const,
      evidence: `${SOURCE_TOOL} parsed ${exported.name} as an exported symbol in ${file.path}.`,
      sourceTool: SOURCE_TOOL,
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
  filesByPath: Map<string, SymbolGraphFile>
): ImpactGraphFragmentEdge {
  const importerRole = filesByPath.get(edge.importerFile)?.role;

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
    evidence: `${SOURCE_TOOL} parsed a ${edge.importKind} import and CodeDecay resolved ${edge.sourceFile}#${edge.sourceSymbol} from ${edge.importerFile}.`,
    sourceTool: SOURCE_TOOL,
    location: {
      file: edge.importerFile,
      line: edge.line
    },
    limitations: importerRole === "test" ? [STATIC_TEST_IMPORT_LIMITATION] : []
  };
}

function findExportLine(files: SymbolGraphFile[], edge: SymbolImportEdge): number | undefined {
  return files
    .find((file) => file.path === edge.sourceFile)
    ?.exports.find((item) => item.name === edge.sourceSymbol || item.name === "*")?.line;
}

function fileNodeId(path: string): string {
  return `file:${path}`;
}

function symbolNodeId(path: string, symbol: string): string {
  return `symbol:${path}#${symbol}`;
}

function persistImpactGraph(rootDir: string, graph: ImpactGraph): ImpactGraph {
  const fullPath = resolveInsideRoot(rootDir, IMPACT_GRAPH_PATH);
  if (!fullPath) {
    return graph;
  }

  const graphWithArtifact: ImpactGraph = {
    ...graph,
    artifactPath: IMPACT_GRAPH_PATH
  };

  try {
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, `${JSON.stringify(graphWithArtifact, null, 2)}\n`, "utf8");
    return graphWithArtifact;
  } catch {
    return graph;
  }
}

function resolveInsideRoot(rootDir: string, repoPath: string): string | undefined {
  const rootPath = resolve(rootDir);
  const fullPath = resolve(rootPath, repoPath);
  const relativePath = relative(rootPath, fullPath);
  return relativePath.startsWith("..") || isAbsolute(relativePath) ? undefined : fullPath;
}
