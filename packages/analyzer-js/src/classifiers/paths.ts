import type { FileChange, ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import { isPackageMetadataOnlyChange } from "./package-metadata";
import {
  isAssetPath,
  isDocsPath,
  isLockfilePath,
  isSourcePath,
  isTestPath
} from "./path-matchers";

export type AreaKind = ImpactedArea["kind"];

export interface PathClassification {
  kind: AreaKind;
  name: string;
  risk: RiskLevel;
}

export function classifyChange(change: FileChange): PathClassification | undefined {
  if (isLockfilePath(change.path)) {
    return { kind: "config", name: "Dependency lockfile", risk: "low" };
  }

  if (isPackageMetadataOnlyChange(change)) {
    return { kind: "config", name: "Package metadata", risk: "low" };
  }

  return classifyPath(change.path);
}

export function classifyPath(path: string): PathClassification | undefined {
  const normalized = path.toLowerCase();

  if (isAssetPath(normalized)) {
    return undefined;
  }

  if (isDocsPath(normalized)) {
    return { kind: "docs", name: "Documentation", risk: "low" };
  }

  if (isTestPath(normalized)) {
    return { kind: "test", name: "Tests", risk: "low" };
  }

  if (/(^|\/)(auth|session|sessions|jwt|oauth|middleware|permissions?|rbac|acl)(\/|\.|-|_)/i.test(path)) {
    return { kind: "auth", name: "Authentication and authorization", risk: "high" };
  }

  if (
    /(^|\/)(schema\.prisma|migrations?|drizzle|knex|sequelize|typeorm|db|database|models?)(\/|\.|-|_|$)/i.test(path)
  ) {
    return { kind: "database", name: "Database and schema", risk: "high" };
  }

  if (/(^|\/)(pages\/api|app\/api|api|routes?|controllers?)(\/|\.|-|_)/i.test(path)) {
    return { kind: "api", name: "API surface", risk: "high" };
  }

  if (/(^|\/)(app|pages|routes|screens|views)(\/|\.|-|_)/i.test(path) && isSourcePath(path)) {
    return { kind: "ui", name: "UI route", risk: "medium" };
  }

  if (
    /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|tsconfig|next\.config|vite\.config|webpack\.config|eslint|prettier|dockerfile|compose|\.github\/workflows|vercel\.json|netlify\.toml)/i.test(
      path
    )
  ) {
    return { kind: "config", name: "Build and runtime configuration", risk: "medium" };
  }

  if (isSourcePath(path)) {
    return { kind: "source", name: "Source code", risk: "low" };
  }

  return undefined;
}

export { isAssetPath, isDocsPath, isLockfilePath, isPackageMetadataOnlyChange, isSourcePath, isTestPath };

export function isLowSignalChange(change: FileChange): boolean {
  return (
    isDocsPath(change.path) ||
    isAssetPath(change.path) ||
    isLockfilePath(change.path) ||
    isPackageMetadataOnlyChange(change)
  );
}
