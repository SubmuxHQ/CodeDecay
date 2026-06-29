import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { dedupeStrings } from "@submuxhq/codedecay-core";

export function discoverProductDashboardArtifacts(rootDir: string, inputPaths: string[]): string[] {
  const candidates = [
    join(rootDir, ".codedecay", "local", "product-runs"),
    join(rootDir, ".codedecay", "local", "product-trends"),
    ...inputPaths.map((path) => resolve(rootDir, path))
  ];
  const discovered: string[] = [];

  for (const candidate of candidates) {
    discovered.push(...discoverJsonFiles(candidate));
  }

  return dedupeStrings(discovered.map((path) => resolve(path))).sort((left, right) => left.localeCompare(right));
}

export function loadProductDashboardReport(path: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { targets?: unknown }).targets)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function discoverJsonFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stats = statSync(path);
  if (stats.isFile()) {
    return path.endsWith(".json") ? [path] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      return discoverJsonFiles(child);
    }

    return entry.isFile() && entry.name.endsWith(".json") ? [child] : [];
  });
}
