import type { PackageManager, UninstallPlan, UpdatePlan } from "../../types";

export const PACKAGE_NAME = "@submuxhq/codedecay";

export function packageManagerInstallCommand(manager: PackageManager): Omit<UpdatePlan, "manager" | "source"> {
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

export function packageManagerRemoveCommand(
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
