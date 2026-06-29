import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CODEDECAY_AUDIT_DATA_DIR, CODEDECAY_AUDIT_SCHEMA_VERSION, type AuditProjectRecord } from "./types";
import { createAuditProjectRecord } from "./project";

export function auditProjectPath(rootDir: string, projectId: string): string {
  return join(rootDir, CODEDECAY_AUDIT_DATA_DIR, sanitizeAuditProjectId(projectId), "project.json");
}

export function loadAuditProjectRecord(rootDir: string, projectId: string): AuditProjectRecord {
  const path = auditProjectPath(rootDir, projectId);
  if (!existsSync(path)) {
    return createAuditProjectRecord({ projectId });
  }

  return parseAuditProjectRecord(readFileSync(path, "utf8"), path);
}

export function saveAuditProjectRecord(rootDir: string, project: AuditProjectRecord): string {
  const path = auditProjectPath(rootDir, project.projectId);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
  return path;
}

export function sanitizeAuditProjectId(projectId: string): string {
  let sanitized = projectId
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => (isSafeProjectIdChar(char) ? char : "-"))
    .join("");

  while (sanitized.includes("--")) {
    sanitized = sanitized.replaceAll("--", "-");
  }

  while (sanitized.startsWith("-")) {
    sanitized = sanitized.slice(1);
  }

  while (sanitized.endsWith("-")) {
    sanitized = sanitized.slice(0, -1);
  }

  return sanitized.length > 0 ? sanitized : "default";
}

function parseAuditProjectRecord(raw: string, path: string): AuditProjectRecord {
  const parsed = JSON.parse(raw) as Partial<AuditProjectRecord>;
  if (parsed.schemaVersion !== CODEDECAY_AUDIT_SCHEMA_VERSION) {
    throw new Error(`Invalid CodeDecay audit data at ${path}: unsupported schemaVersion.`);
  }

  if (typeof parsed.projectId !== "string" || !parsed.projectId) {
    throw new Error(`Invalid CodeDecay audit data at ${path}: projectId is required.`);
  }

  if (!Array.isArray(parsed.runs) || typeof parsed.files !== "object" || parsed.files === null) {
    throw new Error(`Invalid CodeDecay audit data at ${path}: runs and files are required.`);
  }

  return parsed as AuditProjectRecord;
}

function isSafeProjectIdChar(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-" || char === "_";
}
