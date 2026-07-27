import { resolve } from "node:path";
import {
  hasBlockingRequirementTrace,
  shouldFailForRisk
} from "@submuxhq/codedecay-core";
import { CliExit } from "../errors";
import { parseAiArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { createAgentWorkflow } from "./agent-workflow";
import type { RedteamReportDependencies } from "./redteam-report";

export interface RunAiCommandDependencies extends RedteamReportDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runAiCommand(
  context: CliCommandContext,
  dependencies: RunAiCommandDependencies
): Promise<void> {
  const options = parseAiArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const workflow = await createAgentWorkflow(cwd, options, dependencies);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: workflow.rendered,
    runtime: context.runtime
  });

  if (!workflow.report) {
    return;
  }

  if (options.failOn && shouldFailForRisk(workflow.report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
  if (options.withChecks && isBlockingVerificationStatus(workflow.report.summary.verificationStatus)) {
    throw new CliExit(1);
  }
  if (options.failOnRequirements && hasBlockingRequirementTrace(workflow.report.requirementTrace)) {
    throw new CliExit(1);
  }
}

function isBlockingVerificationStatus(status: string): boolean {
  return status === "failed" || status === "blocked";
}
