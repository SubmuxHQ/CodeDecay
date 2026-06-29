import type { UninstallOptions, UninstallPlan, UpdateOptions, UpdatePlan } from "../../types";
import { detectPackageDependency, detectPackageManager, detectPurgeTargets } from "./package-detection";
import { PACKAGE_NAME, packageManagerInstallCommand, packageManagerRemoveCommand } from "./package-commands";

export function createUpdatePlan(cwd: string, options: UpdateOptions): UpdatePlan {
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

export function createUninstallPlan(cwd: string, options: UninstallOptions): UninstallPlan {
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
