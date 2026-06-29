export interface RunDashboardCommandDependencies {
  resolveRepoRoot(cwd: string, options: { format: string }): string;
}
