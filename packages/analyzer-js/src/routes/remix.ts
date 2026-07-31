import type { ImpactedRoute } from "@submuxhq/codedecay-core";
import { HTTP_METHODS, normalizePath, routeImpact } from "./shared";

const REMIX_ROUTE_FILE_PATTERN = /^(?:src\/)?app\/routes\/(.+)\.(?:js|jsx|ts|tsx)$/;

export interface RemixRouteDescriptor {
  path: string;
  route: string;
  methods: string[];
}

export function detectRemixRoute(change: { path: string }, content: string): ImpactedRoute[] {
  const descriptor = describeRemixRouteFile(change.path, content);
  if (!descriptor) {
    return [];
  }

  return [
    routeImpact({
      framework: "remix",
      kind: "ui-route",
      route: descriptor.route,
      methods: descriptor.methods,
      file: change.path,
      risk: "medium",
      reasons: ["Remix file route changed"]
    })
  ];
}

export function describeRemixRouteFile(path: string, content: string): RemixRouteDescriptor | undefined {
  const normalized = normalizePath(path);
  const match = REMIX_ROUTE_FILE_PATTERN.exec(normalized);
  if (!match?.[1]) {
    return undefined;
  }

  return {
    path: normalized,
    route: remixRoutePath(match[1]),
    methods: exportedRemixMethods(content)
  };
}

function remixRoutePath(routeId: string): string {
  const normalized = routeId
    .replace(/\/route$/, "")
    .replace(/(^|\/)_index$/, "$1index");
  const segments = normalized
    .split("/")
    .flatMap((segment) => segment.split("."))
    .filter((segment) => segment.length > 0)
    .filter((segment) => !segment.startsWith("_") || segment === "_index")
    .map((segment) => {
      if (segment === "index" || segment === "_index") {
        return "";
      }
      if (segment === "$") {
        return "*";
      }
      if (segment.startsWith("$")) {
        return `:${segment.slice(1)}`;
      }
      return segment.replaceAll("_", "-");
    })
    .filter((segment) => segment.length > 0);

  return `/${segments.join("/")}`.replace(/\/+/g, "/") || "/";
}

function exportedRemixMethods(content: string): string[] {
  const methods = new Set<string>();
  if (/\bexport\s+(?:async\s+)?function\s+loader\b|\bexport\s+const\s+loader\b/.test(content)) {
    methods.add("GET");
  }
  if (/\bexport\s+(?:async\s+)?function\s+action\b|\bexport\s+const\s+action\b/.test(content)) {
    methods.add("POST");
  }

  return HTTP_METHODS.filter((method) => methods.has(method));
}
