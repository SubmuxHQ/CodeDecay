import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { CliExit } from "../errors";
import { writeStdout } from "../io";
import { parseUninstallArgs, parseUpdateArgs } from "../parsers/args";
import { VALID_PACKAGE_MANAGERS } from "../parsers/primitives";
import {
  renderUninstallPlan as renderUninstallPlanDocument,
  renderUpdatePlan as renderUpdatePlanDocument,
  renderVersion
} from "../renderers/discovery";
import type {
  CliCommandContext,
  CliRuntime,
  PackageManager,
  UninstallOptions,
  UninstallPlan,
  UpdateOptions,
  UpdatePlan
} from "../types";

const PACKAGE_NAME = "@submuxhq/codedecay";
const CODEDECAY_PURGE_FILE_PATTERN = /^codedecay(?:[-_.][a-z0-9._-]+)?\.(?:json|md|sarif|txt)$/i;

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

function createUpdatePlan(cwd: string, options: UpdateOptions): UpdatePlan {
  const detection = options.manager ? { manager: options.manager, source: "override" } : detectPackageManager(cwd);
  const manager = detection?.manager;

  if (!manager) {
    return {
      source: "none",
      displayCommand: `npx -y ${PACKAGE_NAME}@latest --help`,
      command: "npx",
      args: ["-y", `${PACKAGE_NAME}@latest`, "--help"],
      canApply: false
    };
  }

  return {
    manager,
    source: detection?.source ?? "default",
    ...packageManagerInstallCommand(manager)
  };
}

function createUninstallPlan(cwd: string, options: UninstallOptions): UninstallPlan {
  const detection = options.manager ? { manager: options.manager, source: "override" } : detectPackageManager(cwd);
  const dependency = detectPackageDependency(cwd);
  const purgeTargets = options.purgeLocal ? detectPurgeTargets(cwd) : [];
  const manager = detection?.manager;

  if (!manager) {
    return {
      source: "none",
      args: [],
      canApplyPackage: false,
      dependencyLocation: dependency.location,
      dependencyVersion: dependency.version,
      purgeTargets
    };
  }

  const removal = packageManagerRemoveCommand(manager);
  return {
    manager,
    source: detection?.source ?? "default",
    displayCommand: removal.displayCommand,
    command: removal.command,
    args: removal.args,
    canApplyPackage: dependency.location !== "none",
    dependencyLocation: dependency.location,
    dependencyVersion: dependency.version,
    purgeTargets
  };
}

function detectPackageManager(cwd: string): { manager: PackageManager; source: string } | undefined {
  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { packageManager?: string | undefined };
      const configured = normalizePackageManager(parsed.packageManager);
      if (configured) {
        return { manager: configured, source: "package.json#packageManager" };
      }
    } catch {
      // Ignore unreadable package.json for manager detection.
    }
  }

  const lockfiles: Array<[string, PackageManager]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"]
  ];

  for (const [filename, manager] of lockfiles) {
    if (existsSync(join(cwd, filename))) {
      return { manager, source: filename };
    }
  }

  if (existsSync(packageJsonPath)) {
    return { manager: "npm", source: "package.json (default)" };
  }

  return undefined;
}

function normalizePackageManager(value: string | undefined): PackageManager | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.split("@", 1)[0];
  return VALID_PACKAGE_MANAGERS.has(normalized as PackageManager) ? (normalized as PackageManager) : undefined;
}

function detectPackageDependency(
  cwd: string
): { location: "devDependencies" | "dependencies" | "optionalDependencies" | "none"; version?: string } {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return { location: "none" };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string> | undefined;
      devDependencies?: Record<string, string> | undefined;
      optionalDependencies?: Record<string, string> | undefined;
    };

    for (const section of ["devDependencies", "dependencies", "optionalDependencies"] as const) {
      const version = parsed[section]?.[PACKAGE_NAME];
      if (version) {
        return { location: section, version };
      }
    }
  } catch {
    // Ignore unreadable package.json when detecting dependency placement.
  }

  return { location: "none" };
}

function detectPurgeTargets(cwd: string): string[] {
  const targets = new Set<string>();

  if (existsSync(join(cwd, ".codedecay"))) {
    targets.add(".codedecay");
  }

  for (const entry of readdirSync(cwd)) {
    if (CODEDECAY_PURGE_FILE_PATTERN.test(entry)) {
      targets.add(entry);
    }
  }

  return [...targets].sort((left, right) => left.localeCompare(right));
}

function packageManagerInstallCommand(manager: PackageManager): Omit<UpdatePlan, "manager" | "source"> {
  switch (manager) {
    case "pnpm":
      return {
        displayCommand: `pnpm add -D ${PACKAGE_NAME}@latest`,
        command: "pnpm",
        args: ["add", "-D", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
    case "yarn":
      return {
        displayCommand: `yarn add -D ${PACKAGE_NAME}@latest`,
        command: "yarn",
        args: ["add", "-D", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
    case "bun":
      return {
        displayCommand: `bun add -d ${PACKAGE_NAME}@latest`,
        command: "bun",
        args: ["add", "-d", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
    case "npm":
    default:
      return {
        displayCommand: `npm install -D ${PACKAGE_NAME}@latest`,
        command: "npm",
        args: ["install", "-D", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
  }
}

function packageManagerRemoveCommand(
  manager: PackageManager
): Pick<UninstallPlan, "displayCommand" | "command" | "args"> {
  switch (manager) {
    case "pnpm":
      return {
        displayCommand: `pnpm remove ${PACKAGE_NAME}`,
        command: "pnpm",
        args: ["remove", PACKAGE_NAME]
      };
    case "yarn":
      return {
        displayCommand: `yarn remove ${PACKAGE_NAME}`,
        command: "yarn",
        args: ["remove", PACKAGE_NAME]
      };
    case "bun":
      return {
        displayCommand: `bun remove ${PACKAGE_NAME}`,
        command: "bun",
        args: ["remove", PACKAGE_NAME]
      };
    case "npm":
    default:
      return {
        displayCommand: `npm uninstall ${PACKAGE_NAME}`,
        command: "npm",
        args: ["uninstall", PACKAGE_NAME]
      };
  }
}
