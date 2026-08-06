import { resolve } from "node:path";
import { analyzePolicyDecision, renderPolicyDecisionMarkdown } from "@submuxhq/codedecay-knowledge";
import { parsePolicyArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, PolicyOptions } from "../types";

export interface RunPolicyCommandDependencies {
  resolveRepoRoot(cwd: string, options: PolicyOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runPolicyCommand(context: CliCommandContext, dependencies: RunPolicyCommandDependencies): void {
  const options = parsePolicyArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const report = analyzePolicyDecision({
    rootDir,
    policyDirs: options.policyDirs,
    orgPolicyDirs: options.orgPolicyDirs,
    approvalDirs: options.approvalDirs,
    exceptionDirs: options.exceptionDirs,
    changedPaths: options.changedPaths,
    changeClass: options.changeClass,
    now: options.now
  });
  const rendered = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderPolicyDecisionMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
