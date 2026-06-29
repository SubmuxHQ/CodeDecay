import type { CliRuntime } from "../../types";

export interface RunDifferentialCommandDependencies {
  formatGitError(error: unknown, cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): Error;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}
