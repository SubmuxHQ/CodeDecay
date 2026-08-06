import { resolve } from "node:path";
import {
  analyzeConcurrencySafety,
  renderConcurrencySafetyMarkdown
} from "@submuxhq/codedecay-knowledge";
import type { StartMcpServerOptions } from "../server/types";

export interface ConcurrencySafetyToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  experimentFile?: string | undefined;
  surfaceFiles?: string[] | undefined;
  targetKind?: "unspecified" | "fixture-local" | "disposable-local" | "remote-unapproved" | "production-like" | undefined;
  cleanupPlan?: string | undefined;
}

export async function runConcurrencySafetyTool(
  options: StartMcpServerOptions,
  input: ConcurrencySafetyToolInput
): Promise<string> {
  const rootDir = resolve(options.cwd ?? process.cwd(), input.cwd ?? ".");
  const report = analyzeConcurrencySafety({
    rootDir,
    experimentFile: input.experimentFile,
    surfaceFiles: input.surfaceFiles,
    targetKind: input.targetKind,
    cleanupPlan: input.cleanupPlan
  });
  if ((input.format ?? "markdown") === "json") {
    return JSON.stringify(report, null, 2);
  }
  return renderConcurrencySafetyMarkdown(report);
}
