export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface UpdateOptions {
  cwd?: string | undefined;
  manager?: PackageManager | undefined;
  apply: boolean;
}

export interface UninstallOptions {
  cwd?: string | undefined;
  manager?: PackageManager | undefined;
  apply: boolean;
  purgeLocal: boolean;
}

export interface UpdatePlan {
  manager?: PackageManager | undefined;
  source: string;
  displayCommand: string;
  command: string;
  args: string[];
  canApply: boolean;
}

export interface UninstallPlan {
  manager?: PackageManager | undefined;
  source: string;
  displayCommand?: string | undefined;
  command?: string | undefined;
  args: string[];
  canApplyPackage: boolean;
  dependencyLocation: "devDependencies" | "dependencies" | "optionalDependencies" | "none";
  dependencyVersion?: string | undefined;
  purgeTargets: string[];
}
