export interface CliRuntime {
  cwd?: string | undefined;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export interface CliCommandContext {
  args: string[];
  runtime: CliRuntime;
  runtimeCwd: string;
}

export type CliCommandHandler = (context: CliCommandContext) => Promise<void> | void;
export type ConfigFormat = "json" | "markdown";
