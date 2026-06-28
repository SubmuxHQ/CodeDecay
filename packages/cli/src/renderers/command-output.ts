import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import { trimLongOutput } from "./output";

export function appendOutputBlock(lines: string[], label: string, output: string): void {
  const trimmed = output.trim();
  if (!trimmed) {
    return;
  }

  lines.push(`  - ${label}:`);
  lines.push("    ```text");
  for (const line of trimLongOutput(trimmed).split(/\r?\n/)) {
    lines.push(`    ${line}`);
  }
  lines.push("    ```");
}

export function appendCodeBlock(lines: string[], language: string, source: string): void {
  const trimmed = source.trim();
  if (!trimmed) {
    return;
  }

  lines.push(`    \`\`\`${language}`);
  for (const line of trimmed.split(/\r?\n/)) {
    lines.push(`    ${line}`);
  }
  lines.push("    ```");
}

export function formatStatus(status: AdapterStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
