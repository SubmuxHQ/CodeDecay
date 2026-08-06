import { resolve } from "node:path";
import {
  analyzeMigrationSafety,
  renderMigrationSafetyMarkdown
} from "@submuxhq/codedecay-knowledge";
import type { StartMcpServerOptions } from "../server/types";

export interface MigrationSafetyToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  files?: string[] | undefined;
  rollbackFiles?: string[] | undefined;
  targetKind?: "unspecified" | "disposable-local" | "remote-unapproved" | "production-like" | undefined;
  connectionUrl?: string | undefined;
  connectionHost?: string | undefined;
  databaseUrlEnv?: string | undefined;
  cleanupPlan?: string | undefined;
  rollbackFailed?: boolean | undefined;
}

export async function runMigrationSafetyTool(
  options: StartMcpServerOptions,
  input: MigrationSafetyToolInput
): Promise<string> {
  const rootDir = resolve(options.cwd ?? process.cwd(), input.cwd ?? ".");
  const report = analyzeMigrationSafety({
    rootDir,
    files: input.files ?? [],
    rollbackFiles: input.rollbackFiles,
    targetKind: input.targetKind,
    connectionUrl: input.connectionUrl,
    connectionHost: input.connectionHost,
    databaseUrlEnv: input.databaseUrlEnv,
    cleanupPlan: input.cleanupPlan,
    rollbackFailed: input.rollbackFailed
  });
  if ((input.format ?? "markdown") === "json") {
    return JSON.stringify(report, null, 2);
  }
  return renderMigrationSafetyMarkdown(report);
}
