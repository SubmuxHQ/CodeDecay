import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { write } from "../io";
import type { CliRuntime } from "../types";

export function writeCliOutput(input: {
  cwd: string;
  output?: string | undefined;
  rendered: string;
  runtime: CliRuntime;
}): void {
  if (input.output) {
    writeOutput(input.cwd, input.output, input.rendered);
    return;
  }

  write(input.runtime.stdout, input.rendered);
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}
