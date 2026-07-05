import type { ImpactedArea, ImpactedRoute, SymbolImpact } from "@submuxhq/codedecay-core";
import { formatRisk, formatRoute, routeKindLabel } from "../helpers";

export function appendImpactedAreas(lines: string[], areas: ImpactedArea[]): void {
  if (areas.length === 0) {
    lines.push("### What Could Break", "", "No impacted product/system areas were detected.", "");
    return;
  }

  lines.push("### What Could Break", "");
  for (const area of areas.slice(0, 12)) {
    lines.push(`- ${formatRisk(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push("");
}

export function appendImpactedRoutes(lines: string[], routes: ImpactedRoute[]): void {
  lines.push("### Likely Impacted Routes And APIs", "");
  if (routes.length === 0) {
    lines.push("No concrete route/API impacts were detected.", "");
    return;
  }

  for (const route of routes.slice(0, 12)) {
    const files = route.files.map((file) => `\`${file}\``).join(", ");
    lines.push(`- ${formatRisk(route.risk)} \`${formatRoute(route)}\` (${routeKindLabel(route)}): ${files}`);

    for (const reason of route.reasons.slice(0, 2)) {
      lines.push(`  - ${reason}`);
    }

    if (route.recommendedTests.length > 0) {
      lines.push(`  - Suggested evidence: ${route.recommendedTests[0]}`);
    }
  }
  lines.push("");
}

export function appendSymbolImpacts(lines: string[], impacts: SymbolImpact[]): void {
  lines.push("### Symbol Impact Evidence", "");
  if (impacts.length === 0) {
    lines.push("No symbol-level import impacts were detected.", "");
    return;
  }

  for (const impact of impacts.slice(0, 12)) {
    const importers = impact.importerFiles.length > 0
      ? impact.importerFiles.map((file) => `\`${file}\``).join(", ")
      : "no direct importers found";
    lines.push(`- \`${impact.file}#${impact.symbol}\` -> ${importers}`);
    if (impact.routeFiles.length > 0) {
      lines.push(`  - Route/API files: ${impact.routeFiles.map((file) => `\`${file}\``).join(", ")}`);
    }
    if (impact.likelyTests.length > 0) {
      lines.push(`  - Likely tests: ${impact.likelyTests.map((file) => `\`${file}\``).join(", ")}`);
    }
  }

  lines.push("");
}
