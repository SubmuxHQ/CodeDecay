import { resolve } from "node:path";
import { parseMcpArgs } from "../parsers/args";
import type { CliCommandContext } from "../types";

export interface RunMcpCommandDependencies {
  cliPath: string;
}

export async function runMcpCommand(
  context: CliCommandContext,
  dependencies: RunMcpCommandDependencies
): Promise<void> {
  const options = parseMcpArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const { startMcpServer } = await import("@submuxhq/codedecay-mcp");
  await startMcpServer({ cwd, cliPath: dependencies.cliPath });
}
