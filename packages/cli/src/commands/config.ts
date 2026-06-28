import { resolve } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { write } from "../io";
import { parseConfigArgs } from "../parsers/args";
import { renderConfig } from "../renderers/config";
import type { CliCommandContext } from "../types";

export function runConfigCommand(context: CliCommandContext): void {
  const options = parseConfigArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  write(context.runtime.stdout, renderConfig(loadedConfig, options.format));
}
