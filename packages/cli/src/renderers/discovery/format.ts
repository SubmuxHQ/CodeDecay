import type { CommandDoc, HelpOptionDoc } from "./types";

export function appendCommandSummaries(lines: string[], docs: Record<string, CommandDoc>, commands: readonly string[]): void {
  for (const command of commands) {
    const doc = docs[command];
    if (!doc) {
      throw new Error(`Missing CLI help documentation for ${command}.`);
    }

    lines.push(`  ${doc.name.padEnd(12)} ${doc.summary}`);
  }
}

export function appendOptionDocs(lines: string[], options: HelpOptionDoc[]): void {
  const width = Math.max(...options.map((option) => option.flag.length), 0);
  for (const option of options) {
    lines.push(`  ${option.flag.padEnd(width)}   ${option.description}`);
  }
}
