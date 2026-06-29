import type { ImpactedRoute } from "@submuxhq/codedecay-core";
import { isSourcePath, isTestPath } from "../classifiers/paths";
import { extractRouteObjectMethods, findObjectStringProperty } from "./object-parser";
import { HTTP_METHODS, routeImpact, type HttpMethod } from "./shared";

export function detectNodeRoutes(change: { path: string }, content: string): ImpactedRoute[] {
  if (!isNodeRouteCandidate(change.path)) {
    return [];
  }

  const routes: ImpactedRoute[] = [];
  const methodAlternation = HTTP_METHODS.map((method) => method.toLowerCase()).join("|");
  const methodCallPattern = new RegExp(`\\b(app|router|server|fastify)\\.(${methodAlternation})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, "gi");
  let match: RegExpExecArray | null;

  while ((match = methodCallPattern.exec(content)) !== null) {
    const receiver = match[1]?.toLowerCase();
    const method = match[2]?.toUpperCase() as HttpMethod | undefined;
    const route = match[3];
    if (!receiver || !method || !route) {
      continue;
    }

    const framework = receiver === "fastify" || receiver === "server" ? "fastify" : "express";

    routes.push(
      routeImpact({
        framework,
        kind: "route-handler",
        route,
        methods: [method],
        file: change.path,
        risk: "high",
        reasons: [`${framework === "fastify" ? "Fastify" : "Express"} route handler changed`]
      })
    );
  }

  routes.push(...detectFastifyRouteObjects(change, content));

  return routes;
}

function detectFastifyRouteObjects(change: { path: string }, content: string): ImpactedRoute[] {
  const routes: ImpactedRoute[] = [];
  const routeObjectPattern = /\b(?:server|fastify)\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = routeObjectPattern.exec(content)) !== null) {
    const body = match[1] ?? "";
    const url = findObjectStringProperty(body, "url") ?? findObjectStringProperty(body, "path");
    if (!url) {
      continue;
    }

    const methods = extractRouteObjectMethods(body);
    routes.push(
      routeImpact({
        framework: "fastify",
        kind: "route-handler",
        route: url,
        methods,
        file: change.path,
        risk: "high",
        reasons: ["Fastify route object changed"]
      })
    );
  }

  return routes;
}

function isNodeRouteCandidate(path: string): boolean {
  if (!isSourcePath(path) || isTestPath(path)) {
    return false;
  }

  return /(^|\/)(src\/)?(routes?|api|controllers?)(\/|$)|(^|\/)(server|app)\.(js|ts)$/i.test(path);
}
