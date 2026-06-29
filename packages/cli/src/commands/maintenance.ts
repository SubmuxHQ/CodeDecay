import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { CliExit } from "../errors";
import { writeStdout } from "../io";
import { parseUninstallArgs, parseUpdateArgs } from "../parsers/args";
import {
  renderUninstallPlan as renderUninstallPlanDocument,
  renderUpdatePlan as renderUpdatePlanDocument,
  renderVersion
} from "../renderers/discovery";
import type { CliCommandContext, CliRuntime } from "../types";
import { PACKAGE_NAME } from "./maintenance/package-commands";
import { createUninstallPlan, createUpdatePlan } from "./maintenance/plans";

export function runVersionCommand(runtime: CliRuntime): void {
  writeStdout(runtime, renderVersion(CODEDECAY_VERSION));
}

export async function runUpdateCommand(context: CliCommandContext): Promise<void> {
  const options = parseUpdateArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const plan = createUpdatePlan(cwd, options);

  writeStdout(
    context.runtime,
    renderUpdatePlanDocument({
      version: CODEDECAY_VERSION,
      cwd,
      plan,
      apply: options.apply
    })
  );

  if (!options.apply) {
    return;
  }

  if (!plan.canApply) {
    throw new Error('No local package manager command can be applied automatically. Run "codedecay update" for guidance.');
  }

  const result = spawnSync(plan.command, plan.args, {
    cwd,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new CliExit(result.status ?? 1);
  }
}

export async function runUninstallCommand(context: CliCommandContext): Promise<void> {
  const options = parseUninstallArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const plan = createUninstallPlan(cwd, options);

  writeStdout(
    context.runtime,
    renderUninstallPlanDocument({
      version: CODEDECAY_VERSION,
      packageName: PACKAGE_NAME,
      cwd,
      plan,
      apply: options.apply,
      purgeLocal: options.purgeLocal
    })
  );

  if (!options.apply) {
    return;
  }

  const canPurge = options.purgeLocal && plan.purgeTargets.length > 0;
  if (!plan.canApplyPackage && !canPurge) {
    throw new Error('No uninstall actions are available. Run "codedecay uninstall" to inspect the cleanup plan.');
  }

  if (plan.canApplyPackage && plan.command) {
    const result = spawnSync(plan.command, plan.args, {
      cwd,
      stdio: "inherit"
    });

    if (result.status !== 0) {
      throw new CliExit(result.status ?? 1);
    }
  }

  if (canPurge) {
    for (const target of plan.purgeTargets) {
      rmSync(join(cwd, target), { recursive: true, force: true });
    }
  }
}
