import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildEngineeringKnowledgeGraph } from "./context";
import type { ContextServiceBuildInput } from "./service";
import type { EngineeringContextGraph, EngineeringContextNode } from "./types";

export type ContextServiceBuildMode = "full" | "incremental";

export interface ContextServiceBuildStats {
  mode: ContextServiceBuildMode;
  fullRebuildCount: number;
  incrementalRebuildCount: number;
  nodesBefore: number;
  nodesAfter: number;
  invalidatedPaths: string[];
  durationMs: number;
}

export interface DefaultContextServiceBuild {
  build(input: ContextServiceBuildInput): Promise<EngineeringContextGraph>;
  stats(): ContextServiceBuildStats | undefined;
}

/**
 * Default build for LocalContextService.
 * Full rebuilds on initial/git/manual/recovery; incremental updates only rewrite
 * nodes/edges tied to invalidated paths for ordinary file changes.
 */
export function createDefaultContextServiceBuild(options: {
  listFiles?: ((rootDir: string) => string[]) | undefined;
} = {}): DefaultContextServiceBuild {
  let previous: EngineeringContextGraph | undefined;
  let fullRebuildCount = 0;
  let incrementalRebuildCount = 0;
  let lastStats: ContextServiceBuildStats | undefined;
  const listFiles = options.listFiles ?? listLocalRepoFiles;

  return {
    stats: () => lastStats,
    async build(input) {
      if (input.signal.aborted) {
        throw new Error("Indexing cancelled.");
      }
      const started = Date.now();
      const repoFiles = listFiles(input.rootDir).map(normalizePath);
      const forceFull =
        !previous ||
        input.reason === "initial" ||
        input.reason === "git-change" ||
        input.reason === "manual-rebuild" ||
        input.reason === "recovery" ||
        input.invalidatedPaths.length === 0;

      if (forceFull) {
        fullRebuildCount += 1;
        const graph = buildEngineeringKnowledgeGraph({
          rootDir: input.rootDir,
          repoFiles,
          task: "local-context-service"
        });
        previous = graph;
        lastStats = {
          mode: "full",
          fullRebuildCount,
          incrementalRebuildCount,
          nodesBefore: 0,
          nodesAfter: graph.nodes.length,
          invalidatedPaths: input.invalidatedPaths,
          durationMs: Date.now() - started
        };
        return graph;
      }

      if (!previous) {
        throw new Error("Incremental context rebuild requires a prior full index.");
      }

      incrementalRebuildCount += 1;
      const baseline = previous;
      const nodesBefore = baseline.nodes.length;
      const invalidated = new Set(input.invalidatedPaths.map(normalizePath));
      const retainedNodes = baseline.nodes.filter((node) => !nodeTouchesPaths(node, invalidated));
      const retainedIds = new Set(retainedNodes.map((node) => node.id));
      const retainedEdges = baseline.edges.filter(
        (edge) => retainedIds.has(edge.from) && retainedIds.has(edge.to)
      );

      const patch = buildEngineeringKnowledgeGraph({
        rootDir: input.rootDir,
        repoFiles: repoFiles.filter((path) => invalidated.has(path) || pathTouchesInvalidated(path, invalidated)),
        task: "local-context-service-incremental"
      });

      const mergedNodes = new Map(retainedNodes.map((node) => [node.id, node]));
      for (const node of patch.nodes) {
        if (nodeTouchesPaths(node, invalidated) || !mergedNodes.has(node.id)) {
          mergedNodes.set(node.id, node);
        }
      }
      const mergedEdges = new Map(retainedEdges.map((edge) => [edge.id, edge]));
      for (const edge of patch.edges) {
        if (mergedNodes.has(edge.from) && mergedNodes.has(edge.to)) {
          mergedEdges.set(edge.id, edge);
        }
      }

      const graph: EngineeringContextGraph = {
        schemaVersion: baseline.schemaVersion,
        sourceRevision: patch.sourceRevision,
        nodes: [...mergedNodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
        edges: [...mergedEdges.values()].sort((left, right) => left.id.localeCompare(right.id)),
        limitations: [
          ...new Set([
            ...baseline.limitations,
            ...patch.limitations,
            "Incremental context updates rewrite only invalidated path-linked nodes/edges; git and recovery events still force a full rebuild."
          ])
        ]
      };
      previous = graph;
      lastStats = {
        mode: "incremental",
        fullRebuildCount,
        incrementalRebuildCount,
        nodesBefore,
        nodesAfter: graph.nodes.length,
        invalidatedPaths: input.invalidatedPaths,
        durationMs: Date.now() - started
      };
      return graph;
    }
  };
}

function listLocalRepoFiles(rootDir: string): string[] {
  const ignored = new Set([".git", "node_modules", "dist", "coverage", ".codedecay"]);
  const files: string[] = [];
  const visit = (currentDir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignored.has(entry)) continue;
      const absolutePath = join(currentDir, entry);
      let stats;
      try {
        stats = statSync(absolutePath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        visit(absolutePath);
      } else {
        files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
      }
    }
  };
  visit(rootDir);
  return files;
}

function nodeTouchesPaths(node: EngineeringContextNode, invalidated: Set<string>): boolean {
  const paths = [
    node.location?.file,
    ...node.provenance.map((entry) => entry.location?.file)
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
  return paths.some((path) => invalidated.has(normalizePath(path)) || pathTouchesInvalidated(path, invalidated));
}

function pathTouchesInvalidated(path: string, invalidated: Set<string>): boolean {
  const normalized = normalizePath(path);
  for (const candidate of invalidated) {
    if (normalized === candidate || normalized.startsWith(`${candidate}/`) || candidate.startsWith(`${normalized}/`)) {
      return true;
    }
  }
  return false;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
