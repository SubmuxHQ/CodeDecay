import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ImpactGraphFragment,
  ImpactGraphFragmentEdge,
  ImpactGraphFragmentNode
} from "@submuxhq/codedecay-core";
import { listRepoFiles } from "../files/repo";
import { normalizePath } from "../imports/graph/path";
import { describeRemixRouteFile, type RemixRouteDescriptor } from "../routes/remix";

const ADAPTER_ID = "codedecay-remix-file-routes";
const ADAPTER_VERSION = "1.0.0";
const SOURCE_TOOL = "remix-route-conventions";
const ADAPTER_LIMITATIONS = [
  "Remix routes are mapped from file-route conventions without executing the app or reading a generated route manifest.",
  "Pathless layouts, optional segments, custom route manifests, and runtime loader/action behavior are represented conservatively."
];

interface RemixRouteModule {
  path: string;
  route: RemixRouteDescriptor;
}

export function createRemixImpactGraphFragment(rootDir: string): ImpactGraphFragment | undefined {
  const routes = listRepoFiles(rootDir)
    .map((file) => normalizePath(file))
    .sort((left, right) => left.localeCompare(right))
    .flatMap((file) => {
      const content = readRepoFile(rootDir, file);
      if (content === undefined) {
        return [];
      }
      const route = describeRemixRouteFile(file, content);
      return route ? [{ path: file, route }] : [];
    });

  if (routes.length === 0) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    adapter: {
      id: ADAPTER_ID,
      version: ADAPTER_VERSION,
      sourceTool: SOURCE_TOOL,
      status: "available",
      capabilities: {
        nodeKinds: ["ui", "route"],
        edgeKinds: ["serves"]
      },
      limitations: [...ADAPTER_LIMITATIONS]
    },
    nodes: createNodes(routes),
    edges: createEdges(routes),
    limitations: []
  };
}

function createNodes(routes: RemixRouteModule[]): ImpactGraphFragmentNode[] {
  const nodes = new Map<string, ImpactGraphFragmentNode>();

  for (const item of routes) {
    nodes.set(fileNodeId(item.path), {
      id: fileNodeId(item.path),
      kind: "ui",
      label: item.path,
      location: {
        file: item.path
      }
    });
    nodes.set(routeNodeId(item.path, item.route.route), {
      id: routeNodeId(item.path, item.route.route),
      kind: "route",
      label: item.route.route,
      location: {
        file: item.path
      }
    });
  }

  return [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function createEdges(routes: RemixRouteModule[]): ImpactGraphFragmentEdge[] {
  return routes.map((item) => ({
    id: `serves:${item.path}:${item.route.route}`,
    from: fileNodeId(item.path),
    to: routeNodeId(item.path, item.route.route),
    kind: "serves",
    confidence: "direct",
    evidence: `Remix file-route conventions map ${item.path} to ${item.route.route}.`,
    sourceTool: SOURCE_TOOL,
    location: {
      file: item.path
    },
    limitations: [...ADAPTER_LIMITATIONS]
  }));
}

function fileNodeId(path: string): string {
  return `file:${path}`;
}

function routeNodeId(path: string, route: string): string {
  return `route:${path}#${route}`;
}

function readRepoFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}
