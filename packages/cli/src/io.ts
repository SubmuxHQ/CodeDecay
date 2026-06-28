import type { CliRuntime } from "./types";

export function write(writer: ((text: string) => void) | undefined, text: string): void {
  if (writer) {
    writer(text);
    return;
  }

  process.stdout.write(text);
}

export function writeStdout(runtime: CliRuntime, text: string): void {
  write(runtime.stdout, text);
}

export function writeStderr(runtime: CliRuntime, text: string): void {
  if (runtime.stderr) {
    runtime.stderr(text);
    return;
  }

  process.stderr.write(text);
}
