import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type Statement } from "pgsql-ast-parser";
import {
  MIGRATION_EVIDENCE_SCHEMA_VERSION,
  type MigrationMatrixState,
  type MigrationOperationEvidence,
  type MigrationOperationKind,
  type MigrationRisk,
  type MigrationSafetyReport,
  type MigrationTargetKind
} from "./types";

const MAX_FILES = 100;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface AnalyzeMigrationSafetyOptions {
  rootDir: string;
  files: string[];
  targetKind?: MigrationTargetKind | undefined;
  rollbackFiles?: string[] | undefined;
  generatedAt?: string | undefined;
}

export function analyzeMigrationSafety(options: AnalyzeMigrationSafetyOptions): MigrationSafetyReport {
  const rootDir = realpathSync(options.rootDir);
  const targetKind = options.targetKind ?? "unspecified";
  const files = boundedFiles(options.files, "migration");
  const rollbackFiles = boundedFiles(options.rollbackFiles ?? [], "rollback");
  const operations = files.flatMap((path) => parseMigrationFile(rootDir, path, rollbackFiles.length > 0));
  for (const path of rollbackFiles) parseMigrationFile(rootDir, path, true);
  const blockers = operations.filter((item) => item.risk === "blocker").map((item) => `${item.sourceRef}: ${item.detail}`);
  if (targetKind === "production-like") blockers.unshift("Production-like database targets are blocked; use a disposable local database.");
  if (targetKind === "remote-unapproved") blockers.unshift("Remote database target is not explicitly approved as disposable.");
  if (targetKind === "unspecified") blockers.unshift("Database target classification is required before migration execution.");
  const limitations = [
    "Static migration plans do not prove existing-data compatibility, lock duration, application compatibility, or rollback execution.",
    "No database was contacted and no migration command was executed."
  ];
  if (files.length === 0) limitations.unshift("No migration SQL file was supplied.");
  if (targetKind === "unspecified") limitations.unshift("Database target classification is unspecified; execution must remain blocked.");
  const matrix = createMatrix(operations, rollbackFiles.length > 0, targetKind);
  return {
    tool: "CodeDecay",
    schemaVersion: MIGRATION_EVIDENCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    dialect: "postgresql",
    targetKind,
    sourceFiles: files,
    rollbackFiles,
    operations,
    matrix,
    blockers,
    investigationTasks: matrix.flatMap((item) => item.verificationTask ? [item.verificationTask] : []),
    limitations,
    safety: { commandsExecuted: false, databaseConnected: false, migrationApplied: false, secretsRead: false, productionTargetAllowed: false }
  };
}

function parseMigrationFile(rootDir: string, path: string, rollbackProvided: boolean): MigrationOperationEvidence[] {
  const resolved = resolveInside(rootDir, path);
  const size = statSync(resolved).size;
  if (size > MAX_FILE_BYTES) throw new Error(`Migration file exceeds ${MAX_FILE_BYTES} byte limit: ${path}`);
  let statements: Statement[];
  try {
    statements = parse(readFileSync(resolved, "utf8"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new Error(`Unable to parse PostgreSQL migration ${path}: ${message}`);
  }
  return statements.flatMap((statement, index) => normalizeStatement(statement, path, index + 1, rollbackProvided));
}

function normalizeStatement(statement: Statement, path: string, index: number, rollbackProvided: boolean): MigrationOperationEvidence[] {
  const value = statement as unknown as Record<string, unknown>;
  const type = String(value.type ?? "other");
  const table = objectName(value.table) ?? objectName(value.name) ?? "unknown-object";
  if (type === "alter table" && Array.isArray(value.changes)) {
    return value.changes.map((change, changeIndex) => normalizeAlter(change, table, path, index, changeIndex + 1, rollbackProvided));
  }
  if (type === "create index") return [operation("create-index", table, `Create index ${objectName(value.indexName) ?? "unknown-index"} on ${table}.`, path, index, "needs-proof", false, "high", false, rollbackProvided)];
  if (type === "drop table" || type === "drop type" || type === "drop sequence") return [operation("drop-object", table, `Drop ${type.slice(5)} ${table}.`, path, index, "blocker", true, "high", false, rollbackProvided)];
  if (type === "create table" || type === "create type" || type === "create sequence") return [operation("create-object", table, `Create ${type.slice(7)} ${table}.`, path, index, "info", false, "low", false, rollbackProvided)];
  if (type === "update") return [operation("backfill", table, `Backfill data in ${table}.`, path, index, "needs-proof", false, "high", false, rollbackProvided)];
  return [operation("other", table, `Review PostgreSQL statement type ${type}.`, path, index, "needs-proof", false, "unknown", false, rollbackProvided, ["Statement has no specialized migration classifier."])];
}

function normalizeAlter(change: unknown, table: string, path: string, statementIndex: number, changeIndex: number, rollbackProvided: boolean): MigrationOperationEvidence {
  const value = change as Record<string, unknown>;
  const type = String(value.type ?? "alter column");
  const column = objectName(value.column) ?? objectName((value.column as Record<string, unknown> | undefined)?.name) ?? "unknown-column";
  const sourceIndex = `${statementIndex}.${changeIndex}`;
  if (type === "drop column") return operation("drop-column", `${table}.${column}`, `Drop column ${table}.${column}.`, path, sourceIndex, "blocker", true, "high", false, rollbackProvided);
  if (type === "add column") {
    const definition = value.column as Record<string, unknown> | undefined;
    const constraints = Array.isArray(definition?.constraints) ? definition.constraints as Array<Record<string, unknown>> : [];
    const notNull = constraints.some((item) => item.type === "not null");
    const hasDefault = constraints.some((item) => item.type === "default");
    const unsafe = notNull && !hasDefault;
    return operation("add-column", `${table}.${column}`, `Add column ${table}.${column}${unsafe ? " as NOT NULL without a default or proven backfill" : ""}.`, path, sourceIndex, unsafe ? "blocker" : "info", false, unsafe ? "high" : "low", unsafe, rollbackProvided);
  }
  const risky = /set not null|alter type|set data type/i.test(type);
  return operation("alter-column", `${table}.${column}`, `Apply ${type} to ${table}.${column}.`, path, sourceIndex, risky ? "blocker" : "needs-proof", risky, "high", risky, rollbackProvided);
}

function operation(kind: MigrationOperationKind, object: string, detail: string, path: string, index: number | string, risk: MigrationRisk, destructive: boolean, lockRisk: "low" | "unknown" | "high", requiresBackfill: boolean, rollbackProvided: boolean, limitations: string[] = []): MigrationOperationEvidence {
  const sourceRef = `${path}#statement:${index}`;
  return {
    evidenceId: `migration:${createHash("sha256").update(`${sourceRef}\0${kind}\0${object}`).digest("hex").slice(0, 20)}`,
    kind, object, detail, sourceRef, risk, destructive, lockRisk, requiresBackfill,
    rollbackSupported: rollbackProvided ? "unknown" : false,
    limitations: [...limitations, ...(rollbackProvided ? ["Rollback SQL was supplied but not executed."] : ["No rollback SQL was supplied."])]
  };
}

function createMatrix(operations: MigrationOperationEvidence[], rollbackProvided: boolean, targetKind: MigrationTargetKind): MigrationMatrixState[] {
  const risky = operations.filter((item) => item.risk === "blocker");
  const targetBlocked = targetKind !== "disposable-local";
  return [
    { state: "old-app-old-schema", status: "baseline", evidenceIds: [], reason: "Baseline state is unchanged by this plan; runtime behavior was not executed." },
    { state: "old-app-new-schema", status: risky.length || targetBlocked ? "blocked" : "needs-proof", evidenceIds: risky.map((item) => item.evidenceId), reason: risky.length ? "Destructive or incompatible schema operations may break the old application." : "Old application compatibility with the new schema requires execution proof.", verificationTask: "Run the old application against the migrated disposable database and verify representative reads, writes, and jobs." },
    { state: "new-app-old-schema", status: targetBlocked ? "blocked" : "needs-proof", evidenceIds: [], reason: "The new application may access schema objects that do not exist before migration.", verificationTask: "Run the new application against the old disposable schema and verify startup plus changed persistence flows." },
    { state: "new-app-new-schema", status: targetBlocked ? "blocked" : "needs-proof", evidenceIds: operations.map((item) => item.evidenceId), reason: "Static SQL analysis cannot prove existing-data or application behavior.", verificationTask: "Apply the migration to representative disposable data and run changed API, job, and persistence checks." },
    { state: "rollback", status: !rollbackProvided || targetBlocked ? "blocked" : "needs-proof", evidenceIds: operations.filter((item) => item.destructive).map((item) => item.evidenceId), reason: rollbackProvided ? "Rollback SQL exists but has not been executed or checked for data restoration." : "No rollback SQL was supplied.", verificationTask: "Execute the reviewed rollback on a disposable database and prove schema, data, and cleanup outcomes." }
  ];
}

function boundedFiles(files: string[], label: string): string[] {
  if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} ${label} files may be analyzed.`);
  return [...new Set(files)].sort();
}

function resolveInside(rootDir: string, path: string): string {
  const lexical = resolve(rootDir, path);
  if (lexical !== rootDir && !lexical.startsWith(`${rootDir}/`)) throw new Error(`Migration path must stay inside repository: ${path}`);
  if (!existsSync(lexical)) throw new Error(`Migration file not found: ${path}`);
  const real = realpathSync(lexical);
  if (real !== rootDir && !real.startsWith(`${rootDir}/`)) throw new Error(`Migration path must stay inside repository: ${path}`);
  return real;
}

function objectName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" ? record.name : objectName(record.name);
}
