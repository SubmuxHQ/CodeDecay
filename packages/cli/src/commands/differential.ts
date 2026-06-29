import { resolve } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CliExit } from "../errors";
import { parseDifferentialArgs } from "../parsers/args";
import { renderDifferentialReport } from "../renderers/differential";
import type { CliCommandContext, DifferentialReport } from "../types";
import { isDifferentialFailure, requireDifferentialRefs } from "./differential/options";
import { createDifferentialReport } from "./differential/report";
import type { RunDifferentialCommandDependencies } from "./differential/types";

export type { RunDifferentialCommandDependencies } from "./differential/types";

export async function runDifferentialCommand(
  context: CliCommandContext,
  dependencies: RunDifferentialCommandDependencies
): Promise<void> {
  const options = parseDifferentialArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const refs = requireDifferentialRefs(options);
  const rootDir = dependencies.resolveRepoRoot(cwd, { base: refs.base, head: refs.head, format: "markdown" });
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  let report: DifferentialReport;

  try {
    report = await createDifferentialReport(rootDir, refs, loadedConfig);
  } catch (error: unknown) {
    throw dependencies.formatGitError(error, rootDir, { base: refs.base, head: refs.head, format: "markdown" });
  }

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderDifferentialReport(report, options.format),
    runtime: context.runtime
  });

  if (isDifferentialFailure(report.summary.status)) {
    throw new CliExit(1);
  }
}
