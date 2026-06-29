import type { ImpactedRoute, RiskLevel } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { isSourcePath, isTestPath } from "../classifiers/paths";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function detectRoutesForFile(path: string, content: string): ImpactedRoute[] {
  return [...detectNextjsRoute({ path }, content), ...detectNodeRoutes({ path }, content)];
}

export function mergeImpactedRoutes(routes: ImpactedRoute[]): ImpactedRoute[] {
  const byKey = new Map<string, ImpactedRoute>();

  for (const route of routes) {
    const key = `${route.framework}:${route.kind}:${route.route}:${route.methods.join(",")}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        ...route,
        files: [...route.files],
        reasons: [...route.reasons],
        recommendedTests: [...route.recommendedTests]
      });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
    existing.risk = higherRisk(existing.risk, route.risk);
    existing.recommendedTests = dedupeStrings([...existing.recommendedTests, ...route.recommendedTests]);
  }

  return [...byKey.values()];
}

function detectNextjsRoute(change: { path: string }, content: string): ImpactedRoute[] {
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

function detectNodeRoutes(change: { path: string }, content: string): ImpactedRoute[] {
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
    const url = /(?:url|path)\s*:\s*['"`]([^'"`]+)['"`]/i.exec(body)?.[1];
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

function routeImpact(input: {
  framework: ImpactedRoute["framework"];
  kind: ImpactedRoute["kind"];
  route: string;
  methods: string[];
  file: string;
  risk: RiskLevel;
  reasons: string[];
}): ImpactedRoute {
  return {
    framework: input.framework,
    kind: input.kind,
    route: normalizeRoute(input.route),
    methods: dedupeStrings(input.methods.map((method) => method.toUpperCase())),
    files: [input.file],
    risk: input.risk,
    reasons: input.reasons,
    recommendedTests: [`Add or run tests covering ${input.file}`]
  };
}

function higherRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const score = (value: RiskLevel): number => (value === "high" ? 3 : value === "medium" ? 2 : 1);
  return score(left) >= score(right) ? left : right;
}

function findExportedHttpMethods(content: string): string[] {
  const methods = HTTP_METHODS.filter((method) => new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${method}\\b|\\bexport\\s+const\\s+${method}\\b`).test(content));
  return methods.length > 0 ? methods : ["*"];
}

function extractRouteObjectMethods(body: string): string[] {
  const methodValue = findObjectPropertyValue(body, "method");
  if (!methodValue) {
    return ["*"];
  }

  if (methodValue.kind === "array") {
    const methods = extractQuotedHttpMethods(methodValue.value);
    return methods.length > 0 ? methods : ["*"];
  }

  const method = methodValue.value.toUpperCase();
  if (HTTP_METHODS.includes(method as HttpMethod)) {
    return [method];
  }

  return ["*"];
}

function isNodeRouteCandidate(path: string): boolean {
  if (!isSourcePath(path) || isTestPath(path)) {
    return false;
  }

  return /(^|\/)(src\/)?(routes?|api|controllers?)(\/|$)|(^|\/)(server|app)\.(js|ts)$/i.test(path);
}

function normalizeRouteSegments(path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment))
    .map((segment) => (segment === "index" ? "" : segment))
    .filter((segment) => segment.length > 0);

  return segments.join("/");
}

function normalizeRoute(route: string): string {
  const normalized = `/${route}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized.length === 0 ? "/" : normalized;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function findObjectPropertyValue(
  body: string,
  propertyName: string
): { kind: "array" | "string"; value: string } | undefined {
  const lowerBody = body.toLowerCase();
  const lowerPropertyName = propertyName.toLowerCase();
  let searchFrom = 0;

  while (searchFrom < body.length) {
    const propertyIndex = lowerBody.indexOf(lowerPropertyName, searchFrom);
    if (propertyIndex === -1) {
      return undefined;
    }

    searchFrom = propertyIndex + lowerPropertyName.length;

    if (isIdentifierCharacter(body.charAt(propertyIndex - 1)) || isIdentifierCharacter(body.charAt(searchFrom))) {
      continue;
    }

    let cursor = skipWhitespace(body, searchFrom);
    if (body[cursor] !== ":") {
      continue;
    }

    cursor = skipWhitespace(body, cursor + 1);
    const current = body[cursor];

    if (current === "[") {
      const end = findClosingArrayBracket(body, cursor);
      if (end !== -1) {
        return { kind: "array", value: body.slice(cursor + 1, end) };
      }
    }

    if (isQuote(current)) {
      const quoted = readQuotedValue(body, cursor);
      if (quoted) {
        return { kind: "string", value: quoted.value };
      }
    }
  }

  return undefined;
}

function extractQuotedHttpMethods(value: string): string[] {
  const methods: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (!isQuote(value[cursor])) {
      cursor += 1;
      continue;
    }

    const quoted = readQuotedValue(value, cursor);
    if (!quoted) {
      cursor += 1;
      continue;
    }

    const method = quoted.value.toUpperCase();
    if (HTTP_METHODS.includes(method as HttpMethod)) {
      methods.push(method);
    }

    cursor = quoted.endIndex + 1;
  }

  return dedupeStrings(methods);
}

function findClosingArrayBracket(value: string, startIndex: number): number {
  let depth = 0;
  let cursor = startIndex;

  while (cursor < value.length) {
    const current = value[cursor];
    if (isQuote(current)) {
      const quoted = readQuotedValue(value, cursor);
      cursor = quoted ? quoted.endIndex + 1 : cursor + 1;
      continue;
    }

    if (current === "[") {
      depth += 1;
    } else if (current === "]") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  return -1;
}

function readQuotedValue(value: string, startIndex: number): { value: string; endIndex: number } | undefined {
  const quote = value[startIndex];
  if (!isQuote(quote)) {
    return undefined;
  }

  let cursor = startIndex + 1;
  let result = "";

  while (cursor < value.length) {
    const current = value[cursor];
    if (current === "\\") {
      if (cursor + 1 < value.length) {
        result += value[cursor + 1];
        cursor += 2;
        continue;
      }
      break;
    }

    if (current === quote) {
      return { value: result, endIndex: cursor };
    }

    result += current;
    cursor += 1;
  }

  return undefined;
}

function skipWhitespace(value: string, startIndex: number): number {
  let cursor = startIndex;
  while (cursor < value.length && isWhitespace(value[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function isIdentifierCharacter(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    value === "_" ||
    value === "$"
  );
}

function isQuote(value: string | undefined): boolean {
  return value === "\"" || value === "'" || value === "`";
}

function isWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}
