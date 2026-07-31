import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  CodeDecayReport,
  DesignContract,
  ImpactGraph,
  ImpactGraphConfidence,
  ImpactGraphEdge,
  ImpactGraphNode,
  ImpactGraphNodeKind,
  ImpactedArea
} from "@submuxhq/codedecay-core";
import type { CodeDecayMemory, MemoryMatcher } from "@submuxhq/codedecay-memory";
import {
  ENGINEERING_CONTEXT_SCHEMA_VERSION,
  type EngineeringContextConfidence,
  type EngineeringContextDocumentInput,
  type EngineeringContextEdge,
  type EngineeringContextEdgeKind,
  type EngineeringContextGraph,
  type EngineeringContextLocation,
  type EngineeringContextNode,
  type EngineeringContextNodeKind,
  type EngineeringContextProvenance,
  type EngineeringContextProvenanceKind,
  type EngineeringContextRejection,
  type EngineeringContextSelection,
  type EngineeringContextTrustClass,
  type EngineeringTaskContext
} from "./types";

export const ENGINEERING_CONTEXT_ARTIFACT_PATH = ".codedecay/local/task-context.json";
export const IMPACT_GRAPH_ARTIFACT_PATH = ".codedecay/local/impact-graph.json";

const DEFAULT_MAX_NODES = 24;
const DEFAULT_MAX_REJECTED = 16;
const DEFAULT_MAX_EDGES = 96;
const MAX_QUERY_TOKENS = 32;
const MAX_DOCUMENT_BYTES = 64 * 1024;
const MAX_REPO_DOCUMENTS = 80;
const MIN_SELECTED_SCORE = 12;

const GENERIC_QUERY_TOKENS = new Set([
  "acceptance",
  "add",
  "allow",
  "and",
  "api",
  "change",
  "code",
  "create",
  "data",
  "edit",
  "feature",
  "file",
  "fix",
  "for",
  "from",
  "handler",
  "implement",
  "into",
  "make",
  "new",
  "path",
  "route",
  "service",
  "should",
  "task",
  "test",
  "tests",
  "that",
  "the",
  "this",
  "tool",
  "update",
  "user",
  "verify",
  "with",
  "work"
]);

const CURRENT_TRUST_RANK: Record<EngineeringContextTrustClass, number> = {
  "current-revision-fact": 5,
  "historical-context": 3,
  memory: 2,
  "stale-context": 1,
  "ai-suggestion": 0
};

const CONFIDENCE_RANK: Record<EngineeringContextConfidence, number> = {
  direct: 3,
  inferred: 2,
  heuristic: 1
};

export interface EngineeringContextConfigInput {
  commands?: {
    test?: string[] | undefined;
    build?: string[] | undefined;
    start?: string[] | undefined;
  } | undefined;
  probes?: Array<{ name: string; command: string }> | undefined;
  designContract?: DesignContract | undefined;
  productTesting?: {
    targets?: Record<string, {
      apiEndpoints?: Array<{
        id?: string | undefined;
        method: string;
        path: string;
      }> | undefined;
    }> | undefined;
  } | undefined;
}

export interface EngineeringCodeownersEntry {
  path: string;
  line: number;
  pattern: string;
  owners: string[];
}

export interface EngineeringContextRepoInputs {
  documents: EngineeringContextDocumentInput[];
  codeowners: EngineeringCodeownersEntry[];
  packages: Array<{ path: string; name?: string | undefined; scripts: string[] }>;
}

export interface BuildEngineeringKnowledgeGraphOptions {
  rootDir: string;
  sourceRevision?: string | undefined;
  task: string;
  report?: CodeDecayReport | undefined;
  requirements?: CodeDecayReport["requirements"] | undefined;
  impactGraph?: ImpactGraph | undefined;
  memory?: CodeDecayMemory | undefined;
  config?: EngineeringContextConfigInput | undefined;
  repoFiles?: string[] | undefined;
  documents?: EngineeringContextDocumentInput[] | undefined;
  codeowners?: EngineeringCodeownersEntry[] | undefined;
  packages?: Array<{ path: string; name?: string | undefined; scripts: string[] }> | undefined;
}

export interface CreateEngineeringTaskContextOptions extends BuildEngineeringKnowledgeGraphOptions {
  generatedAt?: string | undefined;
  maxNodes?: number | undefined;
  maxRejected?: number | undefined;
  maxEdges?: number | undefined;
}

interface MutableNode extends EngineeringContextNode {
  score?: number | undefined;
  matchedTerms?: string[] | undefined;
  reasons?: string[] | undefined;
}

interface GraphBuilder {
  nodes: Map<string, MutableNode>;
  edges: Map<string, EngineeringContextEdge>;
  sourceRevision: string;
  limitations: string[];
}

interface NodeInput {
  id: string;
  kind: EngineeringContextNodeKind;
  label: string;
  summary: string;
  searchText?: string | undefined;
  confidence: EngineeringContextConfidence;
  trustClass: EngineeringContextTrustClass;
  provenance: EngineeringContextProvenance[];
  limitations?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

interface EdgeInput {
  from: string;
  to: string;
  kind: EngineeringContextEdgeKind;
  summary: string;
  confidence: EngineeringContextConfidence;
  trustClass: EngineeringContextTrustClass;
  provenance: EngineeringContextProvenance[];
  limitations?: string[] | undefined;
}

interface ScoredNode {
  node: MutableNode;
  score: number;
  matchedTerms: string[];
  reasons: string[];
}

export function createEngineeringTaskContext(options: CreateEngineeringTaskContextOptions): EngineeringTaskContext {
  const graph = buildEngineeringKnowledgeGraph(options);
  const queryTokens = tokenizeQuery(options.task);
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxRejected = options.maxRejected ?? DEFAULT_MAX_REJECTED;
  const maxEdges = options.maxEdges ?? DEFAULT_MAX_EDGES;
  const scored = scoreNodes(graph, queryTokens);
  const selectedScored = selectScoredNodes(
    scored.filter((item) => item.score >= MIN_SELECTED_SCORE),
    maxNodes
  );
  const selectedIds = new Set(selectedScored.map((item) => item.node.id));
  const selectedEdges = graph.edges
    .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
    .slice(0, maxEdges);
  const selectedNodes = selectedScored.map((item) => item.node);
  const selected: EngineeringContextSelection[] = selectedScored.map((item, index) => ({
    rank: index + 1,
    nodeId: item.node.id,
    score: item.score,
    matchedTerms: item.matchedTerms,
    reasons: item.reasons,
    evidenceRefs: item.node.provenance.map((source) => source.id)
  }));
  const rejected = scored
    .filter((item) => item.score > 0 && !selectedIds.has(item.node.id))
    .slice(0, maxRejected)
    .map((item): EngineeringContextRejection => ({
      nodeId: item.node.id,
      score: item.score,
      matchedTerms: item.matchedTerms,
      reasons: item.reasons
    }));
  const selectedGraph: EngineeringContextGraph = {
    ...graph,
    artifactPath: ENGINEERING_CONTEXT_ARTIFACT_PATH,
    nodes: selectedNodes.map(stripScoreFields),
    edges: selectedEdges
  };

  return {
    tool: "CodeDecay",
    schemaVersion: ENGINEERING_CONTEXT_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    artifactPath: ENGINEERING_CONTEXT_ARTIFACT_PATH,
    query: {
      task: options.task,
      tokens: queryTokens,
      sourceRevision: graph.sourceRevision,
      maxNodes
    },
    summary: {
      candidateNodes: graph.nodes.length,
      selectedNodes: selectedGraph.nodes.length,
      selectedEdges: selectedGraph.edges.length,
      rejectedDecoys: rejected.length,
      currentRevisionFacts: countTrust(selectedGraph.nodes, "current-revision-fact"),
      historicalContext: countTrust(selectedGraph.nodes, "historical-context"),
      staleContext: countTrust(selectedGraph.nodes, "stale-context"),
      memoryContext: countTrust(selectedGraph.nodes, "memory"),
      aiSuggestions: countTrust(selectedGraph.nodes, "ai-suggestion"),
      limitations: graph.limitations
    },
    graph: selectedGraph,
    selected,
    rejected,
    safety: {
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      memoryTrustedAsFact: false
    }
  };
}

export function buildEngineeringKnowledgeGraph(options: BuildEngineeringKnowledgeGraphOptions): EngineeringContextGraph {
  const sourceRevision = options.sourceRevision ?? resolveGitSourceRevision(options.rootDir);
  const repoInputs = options.documents || options.codeowners || options.packages
    ? {
        documents: options.documents ?? [],
        codeowners: options.codeowners ?? [],
        packages: options.packages ?? []
      }
    : loadEngineeringContextRepoInputs(options.rootDir, options.repoFiles);
  const builder: GraphBuilder = {
    nodes: new Map(),
    edges: new Map(),
    sourceRevision,
    limitations: [
      "Task context retrieval is deterministic lexical and graph-neighbor matching; no embeddings, model reranking, network calls, telemetry, or command execution are used.",
      "Memory, documents, and agent suggestions are context only. They cannot prove current behavior without current-revision tool or runtime evidence.",
      "Selected context is bounded; inspect the persisted artifact and source provenance before treating a candidate as complete."
    ]
  };

  addRequirementNodes(builder, options.task, options.requirements ?? options.report?.requirements);
  addReportNodes(builder, options.report);
  addImpactGraphNodes(builder, options.impactGraph);
  addMemoryNodes(builder, options.memory);
  addConfigNodes(builder, options.config);
  addDocumentNodes(builder, repoInputs.documents);
  addCodeownersNodes(builder, repoInputs.codeowners);
  addPackageNodes(builder, repoInputs.packages);
  addRepoFileNodes(builder, options.repoFiles ?? []);

  return {
    schemaVersion: ENGINEERING_CONTEXT_SCHEMA_VERSION,
    sourceRevision,
    nodes: [...builder.nodes.values()].map(stripScoreFields).sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...builder.edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
    limitations: builder.limitations
  };
}

export function loadEngineeringContextRepoInputs(
  rootDir: string,
  repoFiles: string[] | undefined
): EngineeringContextRepoInputs {
  const files = (repoFiles ?? []).map(normalizeRepoPath).filter((path) => !isLocalGeneratedPath(path));

  return {
    documents: loadEngineeringDocuments(rootDir, files),
    codeowners: loadCodeowners(rootDir, files),
    packages: loadPackageManifests(rootDir, files)
  };
}

export function loadImpactGraphArtifact(rootDir: string, artifactPath: string | undefined): ImpactGraph | undefined {
  const relativePath = normalizeRepoPath(artifactPath ?? IMPACT_GRAPH_ARTIFACT_PATH);
  const fullPath = resolveInsideRoot(rootDir, relativePath);
  if (!fullPath || !existsSync(fullPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return undefined;
    }
    return parsed as unknown as ImpactGraph;
  } catch {
    return undefined;
  }
}

export function persistEngineeringTaskContext(
  rootDir: string,
  context: EngineeringTaskContext,
  artifactPath = ENGINEERING_CONTEXT_ARTIFACT_PATH
): string | undefined {
  const fullPath = resolveInsideRoot(rootDir, artifactPath);
  if (!fullPath) {
    return undefined;
  }

  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify({ ...context, artifactPath }, null, 2)}\n`, "utf8");
  return artifactPath;
}

export function renderEngineeringTaskContextMarkdown(context: EngineeringTaskContext): string {
  const lines = [
    "## CodeDecay Task Context",
    "",
    `Task: ${context.query.task}`,
    `Source revision: \`${context.query.sourceRevision}\``,
    `Selected nodes: ${context.summary.selectedNodes}/${context.summary.candidateNodes}`,
    `Selected edges: ${context.summary.selectedEdges}`,
    "",
    "### Selected Context",
    ""
  ];

  if (context.selected.length === 0) {
    lines.push("No context matched strongly enough. Add a requirements artifact or use more specific task terms.", "");
  }

  const nodesById = new Map(context.graph.nodes.map((node) => [node.id, node]));
  for (const selection of context.selected) {
    const node = nodesById.get(selection.nodeId);
    if (!node) {
      continue;
    }
    lines.push(
      `${selection.rank}. **${node.label}**`,
      `   Kind: \`${node.kind}\`; trust: \`${node.trustClass}\`; confidence: \`${node.confidence}\`; score: ${selection.score}`,
      `   Why: ${selection.reasons.join(" ")}`,
      `   Evidence: ${node.provenance.map((source) => `\`${source.id}\``).join(", ") || "none"}`
    );
    if (node.location?.file) {
      lines.push(`   Location: \`${formatLocation(node.location)}\``);
    }
    if (node.limitations.length > 0) {
      lines.push(`   Limits: ${node.limitations.join(" ")}`);
    }
    lines.push("");
  }

  if (context.graph.edges.length > 0) {
    lines.push("### Evidence Links", "");
    for (const edge of context.graph.edges.slice(0, 24)) {
      const from = nodesById.get(edge.from)?.label ?? edge.from;
      const to = nodesById.get(edge.to)?.label ?? edge.to;
      lines.push(`- ${from} ${edge.kind} ${to}: ${edge.summary}`);
    }
    lines.push("");
  }

  if (context.rejected.length > 0) {
    lines.push("### Rejected Decoys", "");
    for (const rejection of context.rejected.slice(0, 8)) {
      lines.push(`- \`${rejection.nodeId}\` scored ${rejection.score}; ${rejection.reasons.join(" ")}`);
    }
    lines.push("");
  }

  lines.push(
    "### Safety",
    "",
    "- No commands executed.",
    "- No LLM, embedding, hosted service, network, or telemetry call was made.",
    "- Memory and documents remain untrusted context until current-revision evidence corroborates them.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

export function resolveGitSourceRevision(rootDir: string): string {
  const gitDir = resolveGitDirectory(rootDir);
  if (!gitDir) {
    return "working-tree";
  }

  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/i.test(head)) {
      return head;
    }
    const refMatch = /^ref:\s+(.+)$/.exec(head);
    const ref = refMatch?.[1];
    if (!ref) {
      return "working-tree";
    }
    const refPath = join(gitDir, ref);
    if (existsSync(refPath)) {
      const revision = readFileSync(refPath, "utf8").trim();
      return /^[0-9a-f]{40}$/i.test(revision) ? revision : `ref:${ref}`;
    }
    const packedRevision = readPackedRef(gitDir, ref);
    return packedRevision ?? `ref:${ref}`;
  } catch {
    return "working-tree";
  }
}

function addRequirementNodes(
  builder: GraphBuilder,
  task: string,
  requirements: CodeDecayReport["requirements"] | undefined
): void {
  const taskProvenance = provenance(builder, "requirements", "task-input", "Task input", undefined, true);
  addNode(builder, {
    id: "requirement:task",
    kind: "requirement",
    label: "Task requirement",
    summary: requirements?.task.text ?? task,
    confidence: requirements ? "direct" : "heuristic",
    trustClass: "current-revision-fact",
    provenance: [taskProvenance],
    searchText: [
      task,
      requirements?.task.text,
      ...(requirements?.expectedBehavior.map((entry) => entry.text) ?? []),
      ...(requirements?.currentBehavior.map((entry) => entry.text) ?? [])
    ].join(" ")
  });

  for (const criterion of requirements?.acceptanceCriteria ?? []) {
    const criterionId = `requirement:${stableIdPart(criterion.id)}`;
    addNode(builder, {
      id: criterionId,
      kind: "requirement",
      label: `Acceptance criterion ${criterion.id}`,
      summary: criterion.text,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "requirements", criterion.id, `Acceptance criterion ${criterion.id}`, undefined, true)],
      searchText: [criterion.id, criterion.text, ...criterion.requiredProof].join(" ")
    });
    addEdge(builder, {
      from: criterionId,
      to: "requirement:task",
      kind: "implements",
      summary: `${criterion.id} belongs to the task requirement.`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "requirements", criterion.id, `Acceptance criterion ${criterion.id}`, undefined, true)]
    });
  }

  for (const flow of requirements?.affectedFlows ?? []) {
    const flowId = `flow:${stableIdPart(flow.kind)}:${stableIdPart(flow.name)}`;
    addNode(builder, {
      id: flowId,
      kind: "product-flow",
      label: flow.name,
      summary: flow.description ?? `${flow.kind} flow from requirements.`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "requirements", flow.name, "Affected flow", undefined, true)],
      searchText: `${flow.name} ${flow.kind} ${flow.description ?? ""}`
    });
    addEdge(builder, {
      from: "requirement:task",
      to: flowId,
      kind: "mentions",
      summary: "Task requirements mention this affected flow.",
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [taskProvenance]
    });
  }
}

function addReportNodes(builder: GraphBuilder, report: CodeDecayReport | undefined): void {
  if (!report) {
    return;
  }

  addChangedFileReportNodes(builder, report.changedFiles);
  addImpactedRouteReportNodes(builder, report.impactedRoutes ?? []);
  addSymbolImpactReportNodes(builder, report.symbolImpacts ?? []);
  addTestProofReportNodes(builder, report.testProofMap?.entries ?? []);
  addRequirementTraceReportNodes(builder, report.requirementTrace?.criteria ?? []);
  addProductFailureReportNodes(builder, report.productFailureBundles ?? []);
}

function addChangedFileReportNodes(builder: GraphBuilder, changedFiles: CodeDecayReport["changedFiles"]): void {
  for (const change of changedFiles) {
    const fileId = fileNodeId(change.path);
    addFileNode(builder, change.path, {
      summary: `Changed ${change.status} file with ${change.additions} additions and ${change.deletions} deletions.`,
      provenanceKind: "git-diff",
      source: "changed-files",
      confidence: "direct",
      trustClass: "current-revision-fact"
    });
    addEdge(builder, {
      from: fileId,
      to: "requirement:task",
      kind: "relates-to",
      summary: "Changed file belongs to the current task context.",
      confidence: "heuristic",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "git-diff", change.path, "Changed file", { file: change.path }, true)]
    });
  }
}

function addImpactedRouteReportNodes(builder: GraphBuilder, routes: NonNullable<CodeDecayReport["impactedRoutes"]>): void {
  for (const route of routes) {
    const routeId = routeNodeId(route.methods, route.route);
    addNode(builder, {
      id: routeId,
      kind: route.kind === "api-route" || route.kind === "route-handler" ? "api" : "route",
      label: formatRoute(route.methods, route.route),
      summary: `${route.framework} ${route.kind} impact with ${route.risk} risk.`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "tool-evidence", routeId, "Route impact analysis", route.files[0] ? { file: route.files[0] } : undefined, true)],
      searchText: [route.framework, route.kind, route.route, route.methods.join(" "), route.reasons.join(" "), route.files.join(" ")].join(" "),
      metadata: {
        route: route.route,
        methods: route.methods,
        framework: route.framework,
        risk: route.risk
      }
    });
    for (const file of route.files) {
      addFileNode(builder, file, {
        summary: `Route file for ${formatRoute(route.methods, route.route)}.`,
        provenanceKind: "tool-evidence",
        source: "route-impact",
        confidence: "direct",
        trustClass: "current-revision-fact"
      });
      addEdge(builder, {
        from: fileNodeId(file),
        to: routeId,
        kind: "serves",
        summary: `File serves ${formatRoute(route.methods, route.route)}.`,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "tool-evidence", routeId, "Route impact analysis", { file }, true)]
      });
    }
  }
}

function addSymbolImpactReportNodes(builder: GraphBuilder, symbols: NonNullable<CodeDecayReport["symbolImpacts"]>): void {
  for (const symbol of symbols) {
    const symbolId = symbolNodeId(symbol.file, symbol.symbol);
    addFileNode(builder, symbol.file, {
      summary: `File exports impacted symbol ${symbol.symbol}.`,
      provenanceKind: "tool-evidence",
      source: "symbol-impact",
      confidence: "direct",
      trustClass: "current-revision-fact"
    });
    addNode(builder, {
      id: symbolId,
      kind: "symbol",
      label: `${symbol.file}#${symbol.symbol}`,
      summary: `Impacted ${symbol.exportKind} export with ${symbol.importerFiles.length} importer(s).`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "tool-evidence", symbolId, "Symbol impact analysis", { file: symbol.file, line: symbol.line }, true)],
      searchText: [symbol.file, symbol.symbol, symbol.importerFiles.join(" "), symbol.routeFiles.join(" "), symbol.likelyTests.join(" "), symbol.reasons.join(" ")].join(" "),
      metadata: {
        file: symbol.file,
        symbol: symbol.symbol
      }
    });
    addEdge(builder, {
      from: fileNodeId(symbol.file),
      to: symbolId,
      kind: "implements",
      summary: `${symbol.file} implements ${symbol.symbol}.`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "tool-evidence", symbolId, "Symbol impact analysis", { file: symbol.file, line: symbol.line }, true)]
    });
    for (const importer of symbol.importerFiles) {
      addFileNode(builder, importer, {
        summary: `Imports impacted symbol ${symbol.symbol}.`,
        provenanceKind: "tool-evidence",
        source: "symbol-impact",
        confidence: "direct",
        trustClass: "current-revision-fact"
      });
      addEdge(builder, {
        from: fileNodeId(importer),
        to: symbolId,
        kind: "depends-on",
        summary: `${importer} imports ${symbol.symbol}.`,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "tool-evidence", `${symbolId}:${importer}`, "Symbol import edge", { file: importer }, true)]
      });
    }
    for (const test of symbol.likelyTests) {
      addTestNode(builder, test, `Likely impacted test for ${symbol.symbol}.`, "tool-evidence");
      addEdge(builder, {
        from: fileNodeId(test),
        to: symbolId,
        kind: "tests",
        summary: `${test} likely tests ${symbol.symbol}.`,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "test-proof", `${symbolId}:${test}`, "Likely impacted test", { file: test }, true)]
      });
    }
  }
}

function addTestProofReportNodes(
  builder: GraphBuilder,
  entries: NonNullable<CodeDecayReport["testProofMap"]>["entries"]
): void {
  for (const entry of entries) {
    const targetId = entry.symbol ? symbolNodeId(entry.file, entry.symbol) : fileNodeId(entry.file);
    addNode(builder, {
      id: `verification:test-proof:${stableIdPart(entry.file)}:${stableIdPart(entry.symbol ?? entry.status)}`,
      kind: "verification-evidence",
      label: `Test proof for ${entry.symbol ? `${entry.file}#${entry.symbol}` : entry.file}`,
      summary: `${entry.status}: ${entry.reasons.join(" ") || entry.repairTask}`,
      confidence: entry.proof === "deterministic" ? "direct" : "heuristic",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "test-proof", entry.file, "Changed-path test proof", { file: entry.file, line: entry.line }, true)],
      searchText: [entry.file, entry.symbol, entry.status, entry.evidence, entry.staticReferences.join(" "), entry.routeFiles.join(" "), entry.repairTask].join(" ")
    });
    for (const reference of [...entry.staticReferences, ...entry.weakenedByMocks]) {
      addTestNode(builder, reference, `Static test reference for ${entry.file}.`, "test-proof");
      addEdge(builder, {
        from: fileNodeId(reference),
        to: targetId,
        kind: "tests",
        summary: `${reference} is evidence for ${entry.file}.`,
        confidence: entry.proof === "deterministic" ? "direct" : "heuristic",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "test-proof", `${entry.file}:${reference}`, "Changed-path test proof", { file: reference }, true)]
      });
    }
  }
}

function addRequirementTraceReportNodes(
  builder: GraphBuilder,
  criteria: NonNullable<CodeDecayReport["requirementTrace"]>["criteria"]
): void {
  for (const criterion of criteria) {
    for (const evidence of criterion.evidence) {
      const nodeId = `verification:${stableIdPart(evidence.kind)}:${stableIdPart(evidence.id)}`;
      addNode(builder, {
        id: nodeId,
        kind: "verification-evidence",
        label: evidence.kind,
        summary: evidence.summary,
        confidence: evidence.trusted ? "direct" : "heuristic",
        trustClass: evidence.trusted ? "current-revision-fact" : "ai-suggestion",
        provenance: [
          provenance(builder, evidence.trusted ? "tool-evidence" : "agent-suggestion", evidence.id, evidence.source, evidence.file ? { file: evidence.file } : undefined, evidence.trusted)
        ],
        searchText: [criterion.text, evidence.kind, evidence.source, evidence.target, evidence.summary, evidence.file, evidence.symbol, evidence.route, evidence.command].join(" "),
        limitations: evidence.trusted ? [] : ["Agent evidence is untrusted until corroborated by deterministic or runtime proof."]
      });
      addEdge(builder, {
        from: nodeId,
        to: `requirement:${stableIdPart(criterion.requirementId)}`,
        kind: "observed-by",
        summary: `${evidence.kind} evidence maps to ${criterion.requirementId}.`,
        confidence: evidence.trusted ? "direct" : "heuristic",
        trustClass: evidence.trusted ? "current-revision-fact" : "ai-suggestion",
        provenance: [provenance(builder, "tool-evidence", evidence.id, evidence.source, evidence.file ? { file: evidence.file } : undefined, evidence.trusted)]
      });
    }
  }
}

function addProductFailureReportNodes(
  builder: GraphBuilder,
  failures: NonNullable<CodeDecayReport["productFailureBundles"]>
): void {
  for (const failure of failures) {
    const nodeId = `verification:product-failure:${stableIdPart(failure.id)}`;
    addNode(builder, {
      id: nodeId,
      kind: "verification-evidence",
      label: failure.title,
      summary: failure.summary,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "product-evidence", failure.id, "Product failure bundle", failure.impactedFiles[0] ? { file: failure.impactedFiles[0] } : undefined, true)],
      searchText: [failure.id, failure.title, failure.summary, failure.expected, failure.actual, failure.target.id, failure.impactedFiles.join(" ")].join(" ")
    });
    for (const file of failure.impactedFiles) {
      addFileNode(builder, file, {
        summary: `Impacted by product failure ${failure.id}.`,
        provenanceKind: "product-evidence",
        source: failure.id,
        confidence: "direct",
        trustClass: "current-revision-fact"
      });
      addEdge(builder, {
        from: nodeId,
        to: fileNodeId(file),
        kind: "observed-by",
        summary: `Product failure ${failure.id} points at ${file}.`,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "product-evidence", failure.id, "Product failure bundle", { file }, true)]
      });
    }
  }
}

function addImpactGraphNodes(builder: GraphBuilder, impactGraph: ImpactGraph | undefined): void {
  if (!impactGraph) {
    return;
  }

  const idMap = new Map<string, string>();
  for (const impactNode of impactGraph.nodes) {
    const contextId = contextNodeIdFromImpactNode(impactNode);
    idMap.set(impactNode.id, contextId);
    const contextKind = contextKindFromImpactKind(impactNode.kind, impactNode.location?.file);
    addNode(builder, {
      id: contextId,
      kind: contextKind,
      label: impactNode.label,
      summary: `Impact graph ${impactNode.kind} node from ${impactNode.sourceTool}.`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "impact-graph", impactNode.id, impactNode.sourceTool, impactNode.location, true)],
      searchText: [impactNode.id, impactNode.kind, impactNode.label, impactNode.location?.file, impactNode.sourceTool].join(" "),
      metadata: {
        adapterId: impactNode.adapterId,
        sourceTool: impactNode.sourceTool
      }
    });
  }

  for (const edge of impactGraph.edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) {
      continue;
    }
    addEdge(builder, {
      from,
      to,
      kind: contextEdgeKindFromImpactEdge(edge),
      summary: edge.evidence,
      confidence: confidenceFromImpact(edge.confidence),
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "impact-graph", edge.id, edge.sourceTool, edge.location, true)],
      limitations: edge.limitations
    });
  }
}

function addMemoryNodes(builder: GraphBuilder, memory: CodeDecayMemory | undefined): void {
  if (!memory) {
    return;
  }

  for (const flow of memory.flows) {
    addMemoryNode(builder, "product-flow", "flow", flow.name, flow.description ?? "Repo memory flow.", flow);
  }
  for (const command of memory.commands) {
    addMemoryNode(builder, "verification-evidence", "command", command.name, command.description ?? command.command, command, command.command);
  }
  for (const invariant of memory.invariants) {
    addMemoryNode(builder, "contract", "invariant", invariant.name, invariant.description, invariant, invariant.severity);
  }
  for (const note of memory.architecture) {
    addMemoryNode(builder, "architecture-decision", "architecture", note.title, note.note, note);
  }
  for (const regression of memory.regressions) {
    addMemoryNode(builder, "incident-regression", "regression", regression.title, regression.description, regression, regression.check ?? regression.severity);
  }
}

function addConfigNodes(builder: GraphBuilder, config: EngineeringContextConfigInput | undefined): void {
  if (!config) {
    return;
  }

  for (const [kind, commands] of Object.entries(config.commands ?? {})) {
    for (const command of commands ?? []) {
      const id = `config:command:${stableIdPart(kind)}:${stableIdPart(command)}`;
      addNode(builder, {
        id,
        kind: "verification-evidence",
        label: `${kind} command`,
        summary: command,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "config", id, "CodeDecay configured command", undefined, true)],
        searchText: `${kind} ${command}`
      });
    }
  }

  for (const probe of config.probes ?? []) {
    const id = `config:probe:${stableIdPart(probe.name)}`;
    addNode(builder, {
      id,
      kind: "verification-evidence",
      label: probe.name,
      summary: probe.command,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "config", id, "CodeDecay probe", undefined, true)],
      searchText: `${probe.name} ${probe.command}`
    });
  }

  for (const [targetId, target] of Object.entries(config.productTesting?.targets ?? {})) {
    for (const endpoint of target.apiEndpoints ?? []) {
      const routeId = routeNodeId([endpoint.method.toUpperCase()], endpoint.path);
      addNode(builder, {
        id: routeId,
        kind: "api",
        label: formatRoute([endpoint.method.toUpperCase()], endpoint.path),
        summary: `Configured product API endpoint from target ${targetId}.`,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [provenance(builder, "config", `${targetId}:${endpoint.id ?? endpoint.path}`, "CodeDecay product target", undefined, true)],
        searchText: `${targetId} ${endpoint.id ?? ""} ${endpoint.method} ${endpoint.path}`
      });
    }
  }

  addDesignContractNodes(builder, config.designContract);
}

function addDesignContractNodes(builder: GraphBuilder, contract: DesignContract | undefined): void {
  if (!contract) {
    return;
  }

  for (const fence of contract.scopeFences ?? []) {
    addMatcherContractNode(builder, "scope-fence", fence.id, fence.name ?? fence.id, fence.message ?? "Scope fence.", fence);
  }
  for (const rule of contract.boundaryRules ?? []) {
    addMatcherContractNode(builder, "boundary-rule", rule.id, rule.name ?? rule.id, rule.message ?? rule.rewrite ?? "Boundary rule.", rule.from);
  }
  for (const rule of contract.dependencyRules ?? []) {
    addMatcherContractNode(builder, "dependency-rule", rule.id, rule.name ?? rule.id, rule.message ?? "Dependency rule.", rule);
  }
  for (const rule of contract.bannedApis ?? []) {
    addMatcherContractNode(builder, "banned-api", rule.id, rule.name ?? rule.id, rule.message ?? rule.apis.join(", "), rule);
  }
  for (const rule of contract.patternRules ?? []) {
    addMatcherContractNode(builder, "pattern-rule", rule.id, rule.name ?? rule.id, rule.message ?? [...(rule.required ?? []), ...(rule.forbidden ?? [])].join(" "), rule);
  }
}

function addDocumentNodes(builder: GraphBuilder, documents: EngineeringContextDocumentInput[]): void {
  for (const doc of documents) {
    const trustClass = staleContextFor(`${doc.path} ${doc.title ?? ""} ${doc.content}`) ? "stale-context" : "historical-context";
    const kind = documentNodeKind(doc.path, doc.content);
    const title = doc.title?.trim() || firstMarkdownHeading(doc.content) || basename(doc.path);
    addNode(builder, {
      id: `document:${stableIdPart(doc.path)}`,
      kind,
      label: title,
      summary: firstMeaningfulLine(doc.content) ?? `Repository document ${doc.path}.`,
      confidence: "heuristic",
      trustClass,
      provenance: [provenance(builder, "document", doc.path, "Repository document", { file: doc.path }, false)],
      searchText: `${doc.path} ${title} ${doc.content}`,
      limitations: trustClass === "stale-context"
        ? ["Document appears stale, superseded, deprecated, or conflicting; use as historical context only."]
        : ["Documents are not current behavior proof."]
    });
  }
}

function addCodeownersNodes(builder: GraphBuilder, entries: EngineeringCodeownersEntry[]): void {
  for (const entry of entries) {
    const id = `owner:${stableIdPart(entry.pattern)}`;
    const source = provenance(builder, "codeowners", `${entry.path}:${entry.line}`, "CODEOWNERS", { file: entry.path, line: entry.line }, true);
    addNode(builder, {
      id,
      kind: "ownership",
      label: `${entry.pattern} owners`,
      summary: `${entry.pattern} is owned by ${entry.owners.join(", ")}.`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [source],
      searchText: `${entry.pattern} ${entry.owners.join(" ")}`
    });
    for (const node of builder.nodes.values()) {
      const file = node.location?.file;
      if (!file || !matchesCodeownersPattern(file, entry.pattern)) {
        continue;
      }
      addEdge(builder, {
        from: id,
        to: node.id,
        kind: "owns",
        summary: `${entry.owners.join(", ")} owns ${file}.`,
        confidence: "direct",
        trustClass: "current-revision-fact",
        provenance: [source]
      });
    }
  }
}

function addPackageNodes(builder: GraphBuilder, packages: Array<{ path: string; name?: string | undefined; scripts: string[] }>): void {
  for (const manifest of packages) {
    const id = `package:${stableIdPart(manifest.path)}`;
    addNode(builder, {
      id,
      kind: "package",
      label: manifest.name ?? manifest.path,
      summary: `${manifest.path}${manifest.scripts.length ? ` scripts: ${manifest.scripts.join(", ")}` : ""}`,
      confidence: "direct",
      trustClass: "current-revision-fact",
      provenance: [provenance(builder, "package-manifest", manifest.path, "package.json", { file: manifest.path }, true)],
      searchText: `${manifest.name ?? ""} ${manifest.path} ${manifest.scripts.join(" ")}`
    });
  }
}

function addRepoFileNodes(builder: GraphBuilder, repoFiles: string[]): void {
  for (const path of repoFiles) {
    if (isLocalGeneratedPath(path)) {
      continue;
    }
    const normalized = normalizeRepoPath(path);
    if (builder.nodes.has(fileNodeId(normalized))) {
      continue;
    }
    if (isContextDocumentPath(normalized)) {
      continue;
    }
    if (!shouldCreateFallbackFileNode(normalized)) {
      continue;
    }
    addFileNode(builder, normalized, {
      summary: `Repository file ${normalized}.`,
      provenanceKind: "git-diff",
      source: "repo-file-list",
      confidence: "heuristic",
      trustClass: "current-revision-fact"
    });
  }
}

function addMemoryNode(
  builder: GraphBuilder,
  kind: EngineeringContextNodeKind,
  section: string,
  title: string,
  summary: string,
  matcher: MemoryMatcher,
  extraSearchText = ""
): void {
  const stale = staleContextFor(`${title} ${summary}`);
  const id = `memory:${section}:${stableIdPart(title)}`;
  addNode(builder, {
    id,
    kind,
    label: title,
    summary,
    confidence: stale ? "heuristic" : "inferred",
    trustClass: stale ? "stale-context" : "memory",
    provenance: [provenance(builder, "memory", id, `.codedecay/memory.json ${section}`, undefined, false)],
    searchText: [
      section,
      title,
      summary,
      matcher.files?.join(" "),
      matcher.areas?.join(" "),
      matcher.productPaths?.join(" "),
      extraSearchText
    ].join(" "),
    limitations: [
      stale
        ? "Memory appears stale, deprecated, superseded, or conflicting; it is visible but cannot be trusted as current fact."
        : "Repo memory is untrusted context until corroborated by current-revision code, tests, or runtime evidence."
    ]
  });
}

function addMatcherContractNode(
  builder: GraphBuilder,
  section: string,
  id: string,
  label: string,
  summary: string,
  matcher: MemoryMatcher
): void {
  const nodeId = `contract:${section}:${stableIdPart(id)}`;
  addNode(builder, {
    id: nodeId,
    kind: "contract",
    label,
    summary,
    confidence: "direct",
    trustClass: "current-revision-fact",
    provenance: [provenance(builder, "config", nodeId, `CodeDecay design contract ${section}`, undefined, true)],
    searchText: [section, id, label, summary, matcher.files?.join(" "), matcher.areas?.join(" "), matcher.productPaths?.join(" ")].join(" ")
  });
}

function addFileNode(
  builder: GraphBuilder,
  path: string,
  options: {
    summary: string;
    provenanceKind: EngineeringContextProvenanceKind;
    source: string;
    confidence: EngineeringContextConfidence;
    trustClass: EngineeringContextTrustClass;
  }
): void {
  const normalized = normalizeRepoPath(path);
  addNode(builder, {
    id: fileNodeId(normalized),
    kind: fileKind(normalized),
    label: normalized,
    summary: options.summary,
    confidence: options.confidence,
    trustClass: options.trustClass,
    provenance: [provenance(builder, options.provenanceKind, normalized, options.source, { file: normalized }, true)],
    searchText: normalized
  });
}

function addTestNode(builder: GraphBuilder, path: string, summary: string, provenanceKind: EngineeringContextProvenanceKind): void {
  addFileNode(builder, path, {
    summary,
    provenanceKind,
    source: "test evidence",
    confidence: "direct",
    trustClass: "current-revision-fact"
  });
}

function addNode(builder: GraphBuilder, input: NodeInput): void {
  const existing = builder.nodes.get(input.id);
  const node: MutableNode = {
    id: input.id,
    kind: input.kind,
    label: input.label,
    summary: input.summary,
    searchText: normalizeSearchText(input.searchText ?? `${input.label} ${input.summary}`),
    sourceRevision: builder.sourceRevision,
    confidence: input.confidence,
    trustClass: input.trustClass,
    provenance: dedupeProvenance(input.provenance),
    limitations: dedupeStrings(input.limitations ?? []),
    ...(input.provenance[0]?.location ? { location: input.provenance[0].location } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };

  if (!existing) {
    builder.nodes.set(input.id, node);
    return;
  }

  existing.summary = dedupeStrings([existing.summary, node.summary]).join(" ");
  existing.searchText = normalizeSearchText(`${existing.searchText} ${node.searchText}`);
  existing.confidence = strongerConfidence(existing.confidence, node.confidence);
  existing.trustClass = strongerTrust(existing.trustClass, node.trustClass);
  existing.provenance = dedupeProvenance([...existing.provenance, ...node.provenance]);
  existing.limitations = dedupeStrings([...existing.limitations, ...node.limitations]);
  existing.metadata = { ...(existing.metadata ?? {}), ...(node.metadata ?? {}) };
  if (!existing.location && node.location) {
    existing.location = node.location;
  }
}

function addEdge(builder: GraphBuilder, input: EdgeInput): void {
  if (input.from === input.to) {
    return;
  }

  const id = `edge:${stableIdPart(input.kind)}:${stableIdPart(input.from)}:${stableIdPart(input.to)}`;
  const existing = builder.edges.get(id);
  const edge: EngineeringContextEdge = {
    id,
    from: input.from,
    to: input.to,
    kind: input.kind,
    summary: input.summary,
    sourceRevision: builder.sourceRevision,
    confidence: input.confidence,
    trustClass: input.trustClass,
    provenance: dedupeProvenance(input.provenance),
    limitations: dedupeStrings(input.limitations ?? [])
  };

  if (!existing) {
    builder.edges.set(id, edge);
    return;
  }

  existing.summary = dedupeStrings([existing.summary, edge.summary]).join(" ");
  existing.confidence = strongerConfidence(existing.confidence, edge.confidence);
  existing.trustClass = strongerTrust(existing.trustClass, edge.trustClass);
  existing.provenance = dedupeProvenance([...existing.provenance, ...edge.provenance]);
  existing.limitations = dedupeStrings([...existing.limitations, ...edge.limitations]);
}

function scoreNodes(graph: EngineeringContextGraph, queryTokens: string[]): ScoredNode[] {
  const strongTokens = strongQueryTokens(queryTokens);
  const graphBoosts = new Map<string, string[]>();
  const preliminary = graph.nodes.map((node) => scoreNode(node, strongTokens, []));
  const preliminaryById = new Map(preliminary.map((item) => [item.node.id, item]));
  for (const edge of graph.edges) {
    const from = preliminaryById.get(edge.from);
    const to = preliminaryById.get(edge.to);
    if (!from || !to) {
      continue;
    }
    if (from.score >= MIN_SELECTED_SCORE) {
      pushMap(graphBoosts, to.node.id, `Connected to selected ${from.node.kind} context through ${edge.kind} edge.`);
    }
    if (to.score >= MIN_SELECTED_SCORE) {
      pushMap(graphBoosts, from.node.id, `Connected to selected ${to.node.kind} context through ${edge.kind} edge.`);
    }
  }

  return graph.nodes
    .map((node) => scoreNode(node, strongTokens, graphBoosts.get(node.id) ?? []))
    .filter((item) => item.score > 0)
    .sort(compareScoredNodes);
}

function selectScoredNodes(scored: ScoredNode[], maxNodes: number): ScoredNode[] {
  if (maxNodes <= 0) {
    return [];
  }
  if (maxNodes <= 6) {
    return scored.slice(0, maxNodes);
  }

  const anchors = selectChangedFileAnchors(scored, maxNodes);
  const anchorIds = new Set(anchors.map((item) => item.node.id));
  const remaining = scored.filter((item) => !anchorIds.has(item.node.id));
  const perKindLimit = Math.max(2, Math.ceil(maxNodes / 3));
  const selected: ScoredNode[] = [...anchors];
  const deferred: ScoredNode[] = [];
  const selectedIds = new Set<string>(anchorIds);
  const kindCounts = new Map<EngineeringContextNodeKind, number>();
  for (const item of selected) {
    kindCounts.set(item.node.kind, (kindCounts.get(item.node.kind) ?? 0) + 1);
  }

  for (const item of remaining) {
    const count = kindCounts.get(item.node.kind) ?? 0;
    if (count >= perKindLimit) {
      deferred.push(item);
      continue;
    }

    selected.push(item);
    selectedIds.add(item.node.id);
    kindCounts.set(item.node.kind, count + 1);
    if (selected.length === maxNodes) {
      return selected;
    }
  }

  for (const item of deferred) {
    if (selected.length === maxNodes) {
      break;
    }
    if (selectedIds.has(item.node.id)) {
      continue;
    }
    selected.push(item);
    selectedIds.add(item.node.id);
  }

  return selected.sort(compareScoredNodes);
}

function compareScoredNodes(left: ScoredNode, right: ScoredNode): number {
  return (
    right.score - left.score ||
    CURRENT_TRUST_RANK[right.node.trustClass] - CURRENT_TRUST_RANK[left.node.trustClass] ||
    kindPriority(right.node.kind) - kindPriority(left.node.kind) ||
    left.node.id.localeCompare(right.node.id)
  );
}

function selectChangedFileAnchors(scored: ScoredNode[], maxNodes: number): ScoredNode[] {
  const anchorLimit = Math.min(4, Math.max(3, Math.floor(maxNodes / 3)));
  const byMatchedTerm = new Map<string, ScoredNode>();

  for (const item of scored) {
    if (!isChangedFileNode(item.node)) {
      continue;
    }
    for (const term of item.matchedTerms) {
      if (!byMatchedTerm.has(term)) {
        byMatchedTerm.set(term, item);
      }
    }
  }

  return dedupeScoredNodes([...byMatchedTerm.values()]).slice(0, anchorLimit);
}

function dedupeScoredNodes(scored: ScoredNode[]): ScoredNode[] {
  const seen = new Set<string>();
  const deduped: ScoredNode[] = [];
  for (const item of scored) {
    if (seen.has(item.node.id)) {
      continue;
    }
    seen.add(item.node.id);
    deduped.push(item);
  }
  return deduped;
}

function scoreNode(node: EngineeringContextNode, strongTokens: string[], graphReasons: string[]): ScoredNode {
  const matchedTerms = strongTokens.filter((token) => containsTerm(node.searchText, token));
  const reasons: string[] = [];
  const currentRevisionFact = node.trustClass === "current-revision-fact";
  let score = 0;

  if (matchedTerms.length > 0) {
    score += matchedTerms.length * (currentRevisionFact ? 12 : 6);
    reasons.push(`Matched task term(s): ${matchedTerms.join(", ")}.`);
  }

  if (matchedTerms.length >= 2) {
    score += currentRevisionFact ? 8 : 4;
    reasons.push("Multiple task-specific terms matched the same context node.");
  }

  const graphBoost = graphReasons.length > 0 ? 5 : 0;
  if (graphBoost > 0) {
    score += graphBoost;
    reasons.push(...graphReasons);
  }

  score += kindPriority(node.kind);
  if (node.confidence === "direct") {
    score += 4;
  } else if (node.confidence === "inferred") {
    score += 2;
  }

  if (currentRevisionFact) {
    score += 6;
    reasons.push("Current-revision evidence.");
  } else if (node.trustClass === "memory") {
    score -= 2;
    reasons.push("Repo memory match; keep untrusted until corroborated.");
  } else if (node.trustClass === "stale-context") {
    score -= 8;
    reasons.push("Stale or conflicting context; visible but downgraded.");
  } else if (node.trustClass === "ai-suggestion") {
    score -= 10;
    reasons.push("Agent suggestion is untrusted and cannot prove behavior.");
  }

  if (node.trustClass !== "current-revision-fact" && matchedTerms.length === 1 && graphReasons.length === 0) {
    score -= 8;
    reasons.push("Only one task-specific term matched untrusted or historical context, so it was downgraded.");
  }

  if (isChangedFileNode(node)) {
    score += 18;
    reasons.push("Changed file in the current diff.");
  }

  if (matchedTerms.length === 0 && graphReasons.length === 0) {
    score = 0;
  }

  return {
    node: node as MutableNode,
    score,
    matchedTerms,
    reasons: dedupeStrings(reasons)
  };
}

function isChangedFileNode(node: EngineeringContextNode): boolean {
  return node.kind === "file" && node.provenance.some((source) => source.kind === "git-diff" && source.source === "changed-files");
}

function loadEngineeringDocuments(rootDir: string, repoFiles: string[]): EngineeringContextDocumentInput[] {
  const paths = repoFiles
    .filter(isContextDocumentPath)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_REPO_DOCUMENTS);
  const documents: EngineeringContextDocumentInput[] = [];

  for (const path of paths) {
    const fullPath = resolveInsideRoot(rootDir, path);
    if (!fullPath || !existsSync(fullPath) || safeFileSize(fullPath) > MAX_DOCUMENT_BYTES) {
      continue;
    }
    try {
      const content = readFileSync(fullPath, "utf8");
      documents.push({
        path,
        title: firstMarkdownHeading(content),
        content
      });
    } catch {
      continue;
    }
  }

  return documents;
}

function loadCodeowners(rootDir: string, repoFiles: string[]): EngineeringCodeownersEntry[] {
  const path = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"].find((candidate) => repoFiles.includes(candidate));
  if (!path) {
    return [];
  }
  const fullPath = resolveInsideRoot(rootDir, path);
  if (!fullPath || !existsSync(fullPath)) {
    return [];
  }

  try {
    return readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ line }) => line && !line.startsWith("#"))
      .map(({ line, index }) => {
        const [pattern, ...owners] = line.split(/\s+/);
        return pattern && owners.length > 0
          ? { path, line: index + 1, pattern, owners }
          : undefined;
      })
      .filter(isDefined);
  } catch {
    return [];
  }
}

function loadPackageManifests(rootDir: string, repoFiles: string[]): Array<{ path: string; name?: string | undefined; scripts: string[] }> {
  const manifests: Array<{ path: string; name?: string | undefined; scripts: string[] }> = [];
  for (const path of repoFiles.filter((file) => file === "package.json" || file.endsWith("/package.json"))) {
    const fullPath = resolveInsideRoot(rootDir, path);
    if (!fullPath || !existsSync(fullPath) || safeFileSize(fullPath) > MAX_DOCUMENT_BYTES) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
      if (!isRecord(parsed)) {
        continue;
      }
      const scripts = isRecord(parsed.scripts) ? Object.keys(parsed.scripts).sort() : [];
      manifests.push({
        path,
        ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
        scripts
      });
    } catch {
      continue;
    }
  }
  return manifests;
}

function contextNodeIdFromImpactNode(node: ImpactGraphNode): string {
  if ((node.kind === "file" || node.kind === "api" || node.kind === "test") && node.location?.file) {
    return fileNodeId(node.location.file);
  }
  if (node.kind === "route") {
    const parsedRoute = parseRouteLabel(node.label);
    return parsedRoute ? routeNodeId(parsedRoute.methods, parsedRoute.route) : `route:${stableIdPart(node.label)}`;
  }
  if (node.kind === "symbol" && node.location?.file) {
    return symbolNodeId(node.location.file, node.label.replace(/^.*#/, ""));
  }
  return `impact:${stableIdPart(node.id)}`;
}

function contextKindFromImpactKind(kind: ImpactGraphNodeKind, file: string | undefined): EngineeringContextNodeKind {
  if (kind === "test" || (file && fileKind(file) === "test")) {
    return "test";
  }
  if (kind === "route") {
    return "route";
  }
  if (kind === "api") {
    return "api";
  }
  if (kind === "ui" || kind === "product-flow") {
    return "product-flow";
  }
  if (kind === "persistence" || kind === "schema") {
    return "persistence";
  }
  if (kind === "job") {
    return "job";
  }
  if (kind === "event") {
    return "event";
  }
  if (kind === "config" || kind === "env") {
    return "config";
  }
  if (kind === "package") {
    return "package";
  }
  if (kind === "symbol") {
    return "symbol";
  }
  return "file";
}

function contextEdgeKindFromImpactEdge(edge: ImpactGraphEdge): EngineeringContextEdgeKind {
  if (edge.kind === "tests") {
    return "tests";
  }
  if (edge.kind === "serves") {
    return "serves";
  }
  if (edge.kind === "configures") {
    return "constrained-by";
  }
  if (edge.kind === "imports" || edge.kind === "calls" || edge.kind === "reads" || edge.kind === "writes" || edge.kind === "consumes") {
    return "depends-on";
  }
  if (edge.kind === "produces" || edge.kind === "flows-to") {
    return "relates-to";
  }
  return "mentions";
}

function confidenceFromImpact(confidence: ImpactGraphConfidence): EngineeringContextConfidence {
  return confidence;
}

function fileKind(path: string): EngineeringContextNodeKind {
  const normalized = path.toLowerCase();
  if (isTestPath(normalized)) {
    return "test";
  }
  if (normalized.endsWith("package.json")) {
    return "package";
  }
  if (normalized.includes("/migrations/") || normalized.includes("/schema") || normalized.endsWith(".sql")) {
    return "persistence";
  }
  if (normalized.includes("/jobs/") || normalized.includes("/workers/") || normalized.includes("/queues/")) {
    return "job";
  }
  if (normalized.includes("/events/") || normalized.includes("/webhooks/")) {
    return "event";
  }
  if (normalized.includes("/api/") || normalized.includes("/routes/")) {
    return "api";
  }
  if (normalized.endsWith(".md") || normalized.startsWith("docs/")) {
    return documentNodeKind(path, "");
  }
  if (isConfigPath(normalized)) {
    return "config";
  }
  return "file";
}

function documentNodeKind(path: string, content: string): EngineeringContextNodeKind {
  const normalized = `${path} ${content.slice(0, 400)}`.toLowerCase();
  if (normalized.includes("adr") || normalized.includes("rfc") || normalized.includes("architecture decision")) {
    return "architecture-decision";
  }
  if (normalized.includes("incident") || normalized.includes("regression") || normalized.includes("postmortem")) {
    return "incident-regression";
  }
  if (normalized.includes("contract") || normalized.includes("invariant") || normalized.includes("policy")) {
    return "contract";
  }
  if (normalized.includes("flow") || normalized.includes("user journey")) {
    return "product-flow";
  }
  return "memory";
}

function shouldCreateFallbackFileNode(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".sql", ".md", ".yml", ".yaml", ".json"].includes(extension);
}

function matchesCodeownersPattern(file: string, pattern: string): boolean {
  const normalizedFile = normalizeRepoPath(file);
  const normalizedPattern = normalizeRepoPath(pattern).replace(/^\//, "");
  if (!normalizedPattern || normalizedPattern === "*") {
    return true;
  }
  if (normalizedPattern.endsWith("/")) {
    return normalizedFile.startsWith(normalizedPattern);
  }
  if (normalizedPattern.includes("*")) {
    const parts = normalizedPattern.split("*").filter(Boolean);
    let offset = 0;
    for (const part of parts) {
      const index = normalizedFile.indexOf(part, offset);
      if (index === -1) {
        return false;
      }
      offset = index + part.length;
    }
    return true;
  }
  return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
}

function isContextDocumentPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized === "readme.md" ||
    normalized === "agents.md" ||
    normalized.startsWith("docs/") && normalized.endsWith(".md") ||
    normalized.startsWith(".agents/skills/") && normalized.endsWith("skill.md") ||
    normalized.includes("/adr") && normalized.endsWith(".md") ||
    normalized.includes("/rfc") && normalized.endsWith(".md")
  ) && !isLocalGeneratedPath(path);
}

function isConfigPath(path: string): boolean {
  return (
    path.startsWith(".github/") ||
    path.startsWith(".codedecay/") ||
    path.includes("/config/") ||
    path.endsWith("config.yml") ||
    path.endsWith("config.yaml") ||
    path.endsWith("config.json") ||
    path.startsWith("tsconfig") ||
    path.includes("vite.config") ||
    path.includes("webpack.config") ||
    path.includes("eslint.config") ||
    path.includes("dockerfile")
  );
}

function isTestPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized.includes("__tests__") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.tsx") ||
    normalized.endsWith("_test.py")
  );
}

function scoreKindText(kind: EngineeringContextNodeKind): string {
  return kind.replaceAll("-", " ");
}

function kindPriority(kind: EngineeringContextNodeKind): number {
  switch (kind) {
    case "api":
    case "route":
      return 10;
    case "symbol":
    case "job":
    case "event":
    case "persistence":
      return 8;
    case "test":
    case "verification-evidence":
      return 7;
    case "requirement":
    case "contract":
    case "product-flow":
      return 6;
    case "architecture-decision":
    case "incident-regression":
      return 5;
    case "ownership":
    case "package":
    case "config":
      return 4;
    case "file":
    case "memory":
      return 3;
  }
}

function provenance(
  builder: GraphBuilder,
  kind: EngineeringContextProvenanceKind,
  id: string,
  source: string,
  location: EngineeringContextLocation | undefined,
  trusted: boolean
): EngineeringContextProvenance {
  return {
    id: `${kind}:${stableIdPart(id)}`,
    kind,
    source,
    sourceRevision: builder.sourceRevision,
    ...(location ? { location } : {}),
    trusted
  };
}

function tokenizeQuery(value: string): string[] {
  return dedupeStrings(
    normalizeSearchText(value)
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  ).slice(0, MAX_QUERY_TOKENS);
}

function strongQueryTokens(tokens: string[]): string[] {
  const strong = tokens.filter((token) => token.length >= 3 && !GENERIC_QUERY_TOKENS.has(token));
  return strong.length > 0 ? strong : tokens.filter((token) => token.length >= 3);
}

function containsTerm(text: string, token: string): boolean {
  const stem = stemToken(token);
  return text.includes(token) || (stem.length >= 3 && text.includes(stem));
}

function stemToken(token: string): string {
  return token
    .replace(/ies$/, "y")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/s$/, "");
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9_./:#@-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableIdPart(value: string): string {
  return normalizeRepoPath(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_./:#@|-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "unknown";
}

function fileNodeId(path: string): string {
  return `file:${stableIdPart(path)}`;
}

function symbolNodeId(file: string, symbol: string): string {
  return `symbol:${stableIdPart(file)}#${stableIdPart(symbol)}`;
}

function routeNodeId(methods: string[], route: string): string {
  const methodKey = methods.length > 0 ? methods.map((method) => method.toUpperCase()).sort().join("|") : "*";
  return `route:${stableIdPart(methodKey)}:${stableIdPart(route)}`;
}

function formatRoute(methods: string[], route: string): string {
  return `${methods.length > 0 ? `${methods.map((method) => method.toUpperCase()).sort().join("|")} ` : ""}${route}`;
}

function parseRouteLabel(label: string): { methods: string[]; route: string } | undefined {
  const match = /^([A-Z|]+)\s+(\/\S+)$/i.exec(label.trim());
  if (!match?.[1] || !match[2]) {
    return label.trim().startsWith("/") ? { methods: [], route: label.trim() } : undefined;
  }

  return {
    methods: match[1].split("|").map((method) => method.toUpperCase()),
    route: match[2]
  };
}

function formatLocation(location: EngineeringContextLocation): string {
  return `${location.file}${location.line ? `:${location.line}` : ""}`;
}

function stripScoreFields(node: MutableNode): EngineeringContextNode {
  const { score: _score, matchedTerms: _matchedTerms, reasons: _reasons, ...stripped } = node;
  stripped.searchText = normalizeSearchText(`${stripped.searchText} ${scoreKindText(stripped.kind)}`);
  return stripped;
}

function countTrust(nodes: EngineeringContextNode[], trustClass: EngineeringContextTrustClass): number {
  return nodes.filter((node) => node.trustClass === trustClass).length;
}

function strongerConfidence(
  left: EngineeringContextConfidence,
  right: EngineeringContextConfidence
): EngineeringContextConfidence {
  return CONFIDENCE_RANK[right] > CONFIDENCE_RANK[left] ? right : left;
}

function strongerTrust(
  left: EngineeringContextTrustClass,
  right: EngineeringContextTrustClass
): EngineeringContextTrustClass {
  return CURRENT_TRUST_RANK[right] > CURRENT_TRUST_RANK[left] ? right : left;
}

function dedupeProvenance(provenanceItems: EngineeringContextProvenance[]): EngineeringContextProvenance[] {
  const byId = new Map<string, EngineeringContextProvenance>();
  for (const item of provenanceItems) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function staleContextFor(value: string): boolean {
  return /\b(stale|deprecated|superseded|outdated|legacy-only|no longer|conflicting|conflict|replaced by)\b/i.test(value);
}

function firstMarkdownHeading(content: string): string | undefined {
  for (const line of splitTextLines(content)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("# ")) {
      continue;
    }
    const heading = trimmed.slice(2).trim();
    if (heading) {
      return heading;
    }
  }
  return undefined;
}

function firstMeaningfulLine(content: string): string | undefined {
  for (const line of splitTextLines(content)) {
    const trimmed = trimMarkdownHeadingPrefix(line.trim()).trim();
    if (trimmed.length > 0 && !trimmed.startsWith("---")) {
      return trimmed;
    }
  }
  return undefined;
}

function splitTextLines(value: string): string[] {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function trimMarkdownHeadingPrefix(value: string): string {
  let index = 0;
  while (value[index] === "#") {
    index += 1;
  }
  while (value[index] === " " || value[index] === "\t") {
    index += 1;
  }
  return value.slice(index);
}

function isLocalGeneratedPath(path: string): boolean {
  return path === ".codedecay/local" ||
    path.startsWith(".codedecay/local/") ||
    path.includes("/.codedecay/local/") ||
    path.startsWith("docs/.vitepress/dist/") ||
    path.startsWith("docs/.vitepress/cache/");
}

function normalizeRepoPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function resolveInsideRoot(rootDir: string, path: string): string | undefined {
  const fullPath = resolve(rootDir, path);
  const relativePath = relative(rootDir, fullPath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    return undefined;
  }
  return fullPath;
}

function safeFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function resolveGitDirectory(rootDir: string): string | undefined {
  const dotGit = join(rootDir, ".git");
  if (!existsSync(dotGit)) {
    return undefined;
  }
  try {
    const stats = statSync(dotGit);
    if (stats.isDirectory()) {
      return dotGit;
    }
    const content = readFileSync(dotGit, "utf8").trim();
    const match = /^gitdir:\s+(.+)$/i.exec(content);
    if (!match?.[1]) {
      return undefined;
    }
    return resolve(dirname(dotGit), match[1]);
  } catch {
    return undefined;
  }
}

function readPackedRef(gitDir: string, ref: string): string | undefined {
  const packedRefsPath = join(gitDir, "packed-refs");
  if (!existsSync(packedRefsPath)) {
    return undefined;
  }
  try {
    for (const line of readFileSync(packedRefsPath, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || line.startsWith("^")) {
        continue;
      }
      const [revision, packedRef] = line.split(/\s+/);
      if (packedRef === ref && revision && /^[0-9a-f]{40}$/i.test(revision)) {
        return revision;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function pushMap(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
