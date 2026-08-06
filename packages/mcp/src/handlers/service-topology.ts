import { resolve } from "node:path";
import {
  buildServiceTopologyReport,
  renderServiceTopologyReportMarkdown
} from "@submuxhq/codedecay-knowledge";
import type { StartMcpServerOptions } from "../server/types";

export interface ServiceTopologyToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  manifest?: string | undefined;
  openapi?: string[] | undefined;
  asyncapi?: string[] | undefined;
  localGraph?: string | undefined;
  changed?: string[] | undefined;
  invalidate?: string[] | undefined;
  repositoryId?: string | undefined;
  revision?: string | undefined;
  producerServiceId?: string | undefined;
  publisherServiceId?: string | undefined;
  subscriberServiceId?: string | undefined;
}

export async function runServiceTopologyTool(
  options: StartMcpServerOptions,
  input: ServiceTopologyToolInput
): Promise<string> {
  const rootDir = resolve(options.cwd ?? process.cwd(), input.cwd ?? ".");
  const report = buildServiceTopologyReport({
    rootDir,
    manifest: input.manifest,
    openapi: input.openapi,
    asyncapi: input.asyncapi,
    localGraph: input.localGraph,
    changedNodeIds: input.changed,
    invalidatePaths: input.invalidate,
    repositoryId: input.repositoryId,
    revision: input.revision,
    producerServiceId: input.producerServiceId,
    publisherServiceId: input.publisherServiceId,
    subscriberServiceId: input.subscriberServiceId
  });
  if ((input.format ?? "markdown") === "json") {
    return JSON.stringify(report, null, 2);
  }
  return renderServiceTopologyReportMarkdown(report);
}
