import type { AnalyzeOptions, CliAnalysisContext, CliRuntime } from "../../types";

export interface RunExecuteCommandDependencies {
  createAnalysisContext(rootDir: string, options: AnalyzeOptions): CliAnalysisContext;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}
