import type { MigrationAdapterPlan, PrismaMigrationAdapterOptions } from "./types";

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export function createPrismaMigrationAdapterPlan(options: PrismaMigrationAdapterOptions): MigrationAdapterPlan {
  validateLocalPath(options.fromSchema, "fromSchema");
  validateLocalPath(options.toSchema, "toSchema");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error("Prisma migration timeoutMs must be a positive integer.");
  if (!options.cleanupPlan.trim()) throw new Error("Prisma migration cleanupPlan is required.");
  if (options.secretEnvNames.some((name) => !ENV_NAME.test(name))) throw new Error("Prisma migration secretEnvNames must contain environment variable names only.");
  const blockers: string[] = [];
  if (!options.approved) blockers.push("Migration adapter execution requires explicit approval.");
  if (options.targetKind !== "disposable-local") blockers.push("Migration adapter execution is limited to disposable-local targets.");
  return {
    provider: "prisma",
    mode: "schema-diff",
    command: `prisma migrate diff --from-schema ${quote(options.fromSchema)} --to-schema ${quote(options.toSchema)} --script --exit-code`,
    targetKind: options.targetKind,
    requiresApproval: true,
    executable: blockers.length === 0,
    timeoutMs: options.timeoutMs,
    cleanupPlan: options.cleanupPlan.trim(),
    secretEnvNames: [...new Set(options.secretEnvNames)].sort(),
    blockers,
    safety: { readOnly: true, databaseConnected: false, migrationApplied: false }
  };
}

function validateLocalPath(path: string, label: string): void {
  if (!path.trim()) throw new Error(`Prisma migration ${label} is required.`);
  if (path.startsWith("/") || path.includes("..") || /^[a-z]+:/i.test(path)) throw new Error(`Prisma migration ${label} must be a repo-local path.`);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
