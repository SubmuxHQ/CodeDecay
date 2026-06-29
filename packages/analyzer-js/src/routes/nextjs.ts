import type { ImpactedRoute } from "@submuxhq/codedecay-core";
import { HTTP_METHODS, normalizePath, normalizeRouteSegments, routeImpact } from "./shared";

export function detectNextjsRoute(change: { path: string }, content: string): ImpactedRoute[] {
  const normalized = normalizePath(change.path);
  const withoutSrc = normalized.replace(/^src\//, "");

  if (/^middleware\.(js|ts)$/.test(withoutSrc)) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "middleware",
        route: "/",
        methods: ["*"],
        file: change.path,
        risk: "high",
        reasons: ["Next.js middleware changed"]
      })
    ];
  }

  const appApiMatch = /^app\/api\/(.+)\/route\.(js|ts)$/.exec(withoutSrc);
  if (appApiMatch?.[1]) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "api-route",
        route: `/api/${normalizeRouteSegments(appApiMatch[1])}`,
        methods: findExportedHttpMethods(content),
        file: change.path,
        risk: "high",
        reasons: ["Next.js App Router API route changed"]
      })
    ];
  }

  const appPageMatch = /^app\/(.+)\/page\.(js|jsx|ts|tsx)$/.exec(withoutSrc);
  if (appPageMatch?.[1]) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "ui-route",
        route: `/${normalizeRouteSegments(appPageMatch[1])}`,
        methods: [],
        file: change.path,
        risk: "medium",
        reasons: ["Next.js App Router UI route changed"]
      })
    ];
  }

  const pagesApiMatch = /^pages\/api\/(.+)\.(js|ts)$/.exec(withoutSrc);
  if (pagesApiMatch?.[1]) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "api-route",
        route: `/api/${normalizeRouteSegments(pagesApiMatch[1])}`,
        methods: ["*"],
        file: change.path,
        risk: "high",
        reasons: ["Next.js Pages API route changed"]
      })
    ];
  }

  return [];
}

function findExportedHttpMethods(content: string): string[] {
  const methods = HTTP_METHODS.filter((method) => new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${method}\\b|\\bexport\\s+const\\s+${method}\\b`).test(content));
  return methods.length > 0 ? methods : ["*"];
}
