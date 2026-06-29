import type { CodeDecayReport } from "@submuxhq/codedecay-core";

export function renderJsonReport(report: CodeDecayReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
