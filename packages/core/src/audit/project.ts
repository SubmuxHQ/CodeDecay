import {
  CODEDECAY_AUDIT_SCHEMA_VERSION,
  type AuditFileHistoryEntry,
  type AuditFileRecord,
  type AuditProjectRecord,
  type AuditRunRecord
} from "./types";

export function createAuditProjectRecord(input: {
  projectId: string;
  createdAt?: string | undefined;
}): AuditProjectRecord {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    schemaVersion: CODEDECAY_AUDIT_SCHEMA_VERSION,
    projectId: input.projectId,
    createdAt: now,
    updatedAt: now,
    runs: [],
    files: {}
  };
}

export function upsertAuditRun(project: AuditProjectRecord, run: AuditRunRecord): AuditProjectRecord {
  const runs = project.runs.filter((existing) => existing.id !== run.id);
  return {
    ...project,
    updatedAt: run.completedAt ?? run.startedAt,
    runs: [...runs, run].sort((left, right) => left.startedAt.localeCompare(right.startedAt))
  };
}

export function upsertAuditFileRecord(
  project: AuditProjectRecord,
  file: Omit<AuditFileRecord, "history">,
  history: AuditFileHistoryEntry
): AuditProjectRecord {
  const existing = project.files[file.path];
  const existingHistory = existing?.history ?? [];
  const alreadyRecorded = existingHistory.some(
    (entry) => entry.runId === history.runId && entry.contentHash === history.contentHash && entry.status === history.status
  );
  const nextHistory = alreadyRecorded ? existingHistory : [...existingHistory, history];
  const nextFile: AuditFileRecord = {
    ...file,
    history: nextHistory.sort((left, right) => left.analyzedAt.localeCompare(right.analyzedAt))
  };

  return {
    ...project,
    updatedAt: file.updatedAt,
    files: {
      ...project.files,
      [file.path]: nextFile
    }
  };
}
