import type { Finding } from "../types/findings";
import type { LanguageSupportStatus } from "../types/language";
import type { SecurityCandidate } from "../types/security";

export const CODEDECAY_AUDIT_SCHEMA_VERSION = 1;
export const CODEDECAY_AUDIT_DATA_DIR = ".codedecay/data";

export type AuditRunStatus = "running" | "completed" | "failed";
export type AuditFileStatus = "pending" | "analyzed" | "skipped" | "capped" | "unsupported" | "failed";

export interface AuditLockMetadata {
  owner: string;
  pid?: number | undefined;
  createdAt: string;
  expiresAt?: string | undefined;
}

export interface AuditRunRecord {
  schemaVersion: typeof CODEDECAY_AUDIT_SCHEMA_VERSION;
  id: string;
  status: AuditRunStatus;
  startedAt: string;
  completedAt?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
  limitations: string[];
  filePaths: string[];
}

export interface AuditFileHistoryEntry {
  runId: string;
  contentHash: string;
  status: AuditFileStatus;
  analyzedAt: string;
  limitations: string[];
}

export interface AuditFileRecord {
  path: string;
  contentHash: string;
  language: string;
  languageStatus: LanguageSupportStatus;
  status: AuditFileStatus;
  candidates: SecurityCandidate[];
  findings: Finding[];
  limitations: string[];
  history: AuditFileHistoryEntry[];
  updatedAt: string;
}

export interface AuditProjectRecord {
  schemaVersion: typeof CODEDECAY_AUDIT_SCHEMA_VERSION;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  runs: AuditRunRecord[];
  files: Record<string, AuditFileRecord>;
  lock?: AuditLockMetadata | undefined;
}
