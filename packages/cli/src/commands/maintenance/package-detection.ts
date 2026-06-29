import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { VALID_PACKAGE_MANAGERS } from "../../parsers/primitives";
import type { PackageManager } from "../../types";
import { PACKAGE_NAME } from "./package-commands";

const CODEDECAY_PURGE_FILE_PATTERN = /^codedecay(?:[-_.][a-z0-9._-]+)?\.(?:json|md|sarif|txt)$/i;

export function detectPackageManager(cwd: string): { manager: PackageManager; source: string } | undefined {
  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { packageManager?: string | undefined };
      const configured = normalizePackageManager(parsed.packageManager);
      if (configured) {
        return { manager: configured, source: "package.json#packageManager" };
      }
    } catch {
      // Ignore unreadable package.json for manager detection.
    }
  }

  const lockfiles: Array<[string, PackageManager]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"]
  ];

  for (const [filename, manager] of lockfiles) {
    if (existsSync(join(cwd, filename))) {
      return { manager, source: filename };
    }
  }

  if (existsSync(packageJsonPath)) {
    return { manager: "npm", source: "package.json (default)" };
  }

  return undefined;
}

export function detectPackageDependency(
  cwd: string
): { location: "devDependencies" | "dependencies" | "optionalDependencies" | "none"; version?: string } {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return { location: "none" };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string> | undefined;
      devDependencies?: Record<string, string> | undefined;
      optionalDependencies?: Record<string, string> | undefined;
    };

    for (const section of ["devDependencies", "dependencies", "optionalDependencies"] as const) {
      const version = parsed[section]?.[PACKAGE_NAME];
      if (version) {
        return { location: section, version };
      }
    }
  } catch {
    // Ignore unreadable package.json when detecting dependency placement.
  }

  return { location: "none" };
}

export function detectPurgeTargets(cwd: string): string[] {
  const targets = new Set<string>();

  if (existsSync(join(cwd, ".codedecay"))) {
    targets.add(".codedecay");
  }

  for (const entry of readdirSync(cwd)) {
    if (CODEDECAY_PURGE_FILE_PATTERN.test(entry)) {
      targets.add(entry);
    }
  }

  return [...targets].sort((left, right) => left.localeCompare(right));
}

function normalizePackageManager(value: string | undefined): PackageManager | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.split("@", 1)[0];
  return VALID_PACKAGE_MANAGERS.has(normalized as PackageManager) ? (normalized as PackageManager) : undefined;
}
