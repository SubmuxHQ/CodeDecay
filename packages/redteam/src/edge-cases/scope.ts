import {
  isTestFilePath,
  type CodeDecayReport,
  type ImpactedArea
} from "@submuxhq/codedecay-core";
import type { RedteamEdgeCaseScope } from "../types";

export function scopeForArea(
  report: CodeDecayReport,
  areaKind: ImpactedArea["kind"]
): RedteamEdgeCaseScope {
  const matchingAreas = report.impactedAreas.filter((area) => area.kind === areaKind);
  if (matchingAreas.length === 0) {
    return {
      areas: [],
      files: [],
      symbols: [],
      routes: [],
      flows: [],
      requirementIds: []
    };
  }
  const areaFiles = matchingAreas
    .flatMap((area) => area.files)
    .filter((file) => !isTestFilePath(file));
  const fileSet = new Set(areaFiles);
  const symbols = (report.symbolImpacts ?? []).filter((symbol) => fileSet.has(symbol.file));
  const symbolRouteFiles = new Set(symbols.flatMap((symbol) => symbol.routeFiles));
  const routes = (report.impactedRoutes ?? []).filter((route) =>
    routeMatchesArea(areaKind, route.kind, route.files, fileSet, symbolRouteFiles)
  );

  return {
    areas: [areaKind],
    files: uniqueSorted(areaFiles),
    symbols: uniqueSorted(symbols.map((symbol) => `${symbol.file}#${symbol.symbol}`)),
    routes: uniqueSorted(routes.map(formatRoute)),
    flows: [],
    requirementIds: []
  };
}

export function scopeForReport(report: CodeDecayReport): RedteamEdgeCaseScope {
  return {
    areas: uniqueSorted(report.impactedAreas.map((area) => area.kind)),
    files: uniqueSorted(report.changedFiles.map((file) => file.path).filter((file) => !isTestFilePath(file))),
    symbols: uniqueSorted((report.symbolImpacts ?? []).map((symbol) => `${symbol.file}#${symbol.symbol}`)),
    routes: uniqueSorted((report.impactedRoutes ?? []).map(formatRoute)),
    flows: [],
    requirementIds: []
  };
}

export function downstreamConsumersForScope(
  report: CodeDecayReport,
  scope: RedteamEdgeCaseScope
): string[] {
  const files = new Set(scope.files);
  return uniqueSorted(
    (report.symbolImpacts ?? [])
      .filter((symbol) => files.has(symbol.file))
      .flatMap((symbol) =>
        [...symbol.importerFiles, ...symbol.routeFiles].filter(
          (file) => !symbol.likelyTests.includes(file)
        )
      )
      .filter((file) => !files.has(file))
      .filter((file) => !isTestFilePath(file))
  );
}

export function mergeScope(
  left: RedteamEdgeCaseScope,
  right: Partial<RedteamEdgeCaseScope>
): RedteamEdgeCaseScope {
  return {
    areas: uniqueSorted([...left.areas, ...(right.areas ?? [])]),
    files: uniqueSorted([...left.files, ...(right.files ?? [])]),
    symbols: uniqueSorted([...left.symbols, ...(right.symbols ?? [])]),
    routes: uniqueSorted([...left.routes, ...(right.routes ?? [])]),
    flows: uniqueSorted([...left.flows, ...(right.flows ?? [])]),
    requirementIds: uniqueSorted([...left.requirementIds, ...(right.requirementIds ?? [])])
  };
}

export function hasConcreteSurface(scope: RedteamEdgeCaseScope): boolean {
  return scope.files.length > 0 || scope.symbols.length > 0 || scope.routes.length > 0 || scope.flows.length > 0;
}

function routeMatchesArea(
  areaKind: ImpactedArea["kind"],
  routeKind: NonNullable<CodeDecayReport["impactedRoutes"]>[number]["kind"],
  routeFiles: string[],
  areaFiles: Set<string>,
  symbolRouteFiles: Set<string>
): boolean {
  if (routeFiles.some((file) => areaFiles.has(file) || symbolRouteFiles.has(file))) {
    return true;
  }
  if (areaKind === "api") {
    return routeKind !== "ui-route";
  }
  if (areaKind === "ui") {
    return routeKind === "ui-route";
  }
  return false;
}

function formatRoute(route: NonNullable<CodeDecayReport["impactedRoutes"]>[number]): string {
  if (route.kind === "ui-route" && route.methods.length === 0) {
    return route.route;
  }
  const methods = route.methods.length > 0 ? route.methods.join("|") : "ANY";
  return `${methods} ${route.route}`;
}

export function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
