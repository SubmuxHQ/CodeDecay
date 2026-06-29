import type { PackageManager } from "../../types";

export const VALID_PACKAGE_MANAGERS = new Set<PackageManager>(["npm", "pnpm", "yarn", "bun"]);

export function parsePackageManager(value: string): PackageManager {
  if (VALID_PACKAGE_MANAGERS.has(value as PackageManager)) {
    return value as PackageManager;
  }

  throw new Error(`Invalid package manager "${value}". Expected npm, pnpm, yarn, or bun.`);
}
