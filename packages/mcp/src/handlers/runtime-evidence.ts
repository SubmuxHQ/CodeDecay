import { resolve } from "node:path";
import {
  ingestRuntimeEvidence,
  loadServiceTopologyManifest,
  renderRuntimeEvidenceMarkdown
} from "@submuxhq/codedecay-knowledge";
import type { StartMcpServerOptions } from "../server/types";

export interface RuntimeEvidenceToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  telemetry?: string | undefined;
  errors?: string | undefined;
  topology?: string | undefined;
  headRevision?: string | undefined;
  environment?: string | undefined;
}

export async function runRuntimeEvidenceTool(
  options: StartMcpServerOptions,
  input: RuntimeEvidenceToolInput
): Promise<string> {
  const rootDir = resolve(options.cwd ?? process.cwd(), input.cwd ?? ".");
  const topology = input.topology
    ? loadServiceTopologyManifest({ rootDir, path: input.topology })
    : undefined;
  const report = ingestRuntimeEvidence({
    rootDir,
    otlpPath: input.telemetry,
    errorsPath: input.errors,
    topology,
    headRevision: input.headRevision,
    environment: input.environment
  });
  if ((input.format ?? "markdown") === "json") {
    return JSON.stringify(report, null, 2);
  }
  return renderRuntimeEvidenceMarkdown(report);
}
