import { resolve } from "node:path";
import { analyzePolicyDecision, renderPolicyDecisionMarkdown } from "@submuxhq/codedecay-knowledge";
import type { StartMcpServerOptions } from "../server/types";

export interface PolicyDecisionToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  policyDirs?: string[] | undefined;
  orgPolicyDirs?: string[] | undefined;
  approvalDirs?: string[] | undefined;
  exceptionDirs?: string[] | undefined;
  changedPaths?: string[] | undefined;
  changeClass?: "docs" | "migration" | "source" | "protected-path" | "test" | "config" | "unknown" | undefined;
  now?: string | undefined;
}

export async function runPolicyDecisionTool(
  options: StartMcpServerOptions,
  input: PolicyDecisionToolInput
): Promise<string> {
  const rootDir = resolve(options.cwd ?? process.cwd(), input.cwd ?? ".");
  const report = analyzePolicyDecision({
    rootDir,
    policyDirs: input.policyDirs,
    orgPolicyDirs: input.orgPolicyDirs,
    approvalDirs: input.approvalDirs,
    exceptionDirs: input.exceptionDirs,
    changedPaths: input.changedPaths,
    changeClass: input.changeClass,
    now: input.now
  });
  if ((input.format ?? "markdown") === "json") return JSON.stringify(report, null, 2);
  return renderPolicyDecisionMarkdown(report);
}
