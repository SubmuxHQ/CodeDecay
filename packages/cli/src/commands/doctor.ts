import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createDoctorReport,
  renderConfigPreview,
  renderDoctorReport
} from "@submuxhq/codedecay-tool-adapters";
import { write } from "../io";
import { parseDoctorArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";

export interface RunDoctorCommandDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export function runDoctorCommand(
  context: CliCommandContext,
  dependencies: RunDoctorCommandDependencies
): void {
  const options = parseDoctorArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const report = createDoctorReport(cwd);

  if (options.writeConfigPreview) {
    const previewPath = join(cwd, ".codedecay", "local", "config-preview.yml");
    mkdirSync(dirname(previewPath), { recursive: true });
    writeFileSync(previewPath, renderConfigPreview(report), "utf8");
    write(context.runtime.stderr, `Wrote config preview to ${previewPath}\n`);
  }

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderDoctorReport(report, options.format),
    runtime: context.runtime
  });
}
