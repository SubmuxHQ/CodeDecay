import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ApprovalRecord, EngineeringPolicy, ExceptionRecord } from "./types";
import { ENGINEERING_POLICY_SCHEMA_VERSION } from "./types";

export function loadEngineeringPolicies(rootDir: string, dirs: string[]): EngineeringPolicy[] {
  return dirs.flatMap((dir) => loadJsonDir<EngineeringPolicy>(rootDir, dir, isPolicy));
}

export function loadApprovalRecords(rootDir: string, dirs: string[]): ApprovalRecord[] {
  return dirs.flatMap((dir) => loadJsonDir<ApprovalRecord>(rootDir, dir, isApproval));
}

export function loadExceptionRecords(rootDir: string, dirs: string[]): ExceptionRecord[] {
  return dirs.flatMap((dir) => loadJsonDir<ExceptionRecord>(rootDir, dir, isException));
}

function loadJsonDir<T>(rootDir: string, dir: string, guard: (value: unknown) => value is T): T[] {
  const absolute = resolve(rootDir, dir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [];
  const files = readdirSync(absolute).filter((name) => name.endsWith(".json")).sort();
  const out: T[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(absolute, file), "utf8")) as unknown;
    if (!guard(parsed)) throw new Error(`Invalid policy artifact: ${join(dir, file)}`);
    out.push(parsed);
  }
  return out;
}

function isPolicy(value: unknown): value is EngineeringPolicy {
  if (!value || typeof value !== "object") return false;
  const item = value as EngineeringPolicy;
  return (
    typeof item.id === "string" &&
    typeof item.version === "number" &&
    item.schemaVersion === ENGINEERING_POLICY_SCHEMA_VERSION &&
    Array.isArray(item.scopes) &&
    Array.isArray(item.requiredEvidence) &&
    Array.isArray(item.requiredApprovers)
  );
}

function isApproval(value: unknown): value is ApprovalRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as ApprovalRecord;
  return typeof item.id === "string" && typeof item.policyId === "string" && typeof item.actor === "string" && typeof item.revoked === "boolean";
}

function isException(value: unknown): value is ExceptionRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as ExceptionRecord;
  return (
    typeof item.id === "string" &&
    typeof item.policyId === "string" &&
    Array.isArray(item.pathGlobs) &&
    typeof item.expiresAt === "string" &&
    typeof item.revoked === "boolean"
  );
}
