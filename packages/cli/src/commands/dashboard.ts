import { join, resolve } from "node:path";
import { write } from "../io";
import { parseDashboardArgs } from "../parsers/args";
import { renderProductDashboardSummary } from "../renderers/product-dashboard";
import type { CliCommandContext } from "../types";
import { createProductDashboard, resetProductDashboardFailures, writeProductDashboard } from "./dashboard/report";
import type { RunDashboardCommandDependencies } from "./dashboard/types";

export type { RunDashboardCommandDependencies } from "./dashboard/types";

export function runDashboardCommand(
  context: CliCommandContext,
  dependencies: RunDashboardCommandDependencies
): void {
  const options = parseDashboardArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const outputDir = resolve(cwd, options.output ?? join(".codedecay", "local", "dashboard"));
  resetProductDashboardFailures(outputDir);
  const dashboard = createProductDashboard(rootDir, outputDir, options);

  writeProductDashboard(outputDir, dashboard);
  write(context.runtime.stdout, renderProductDashboardSummary(dashboard, options.format));
}
