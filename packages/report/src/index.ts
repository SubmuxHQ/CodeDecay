import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { renderJsonReport } from "./json";
import { renderMarkdownReport } from "./markdown";
import { renderSarifReport } from "./sarif";

export { renderJsonReport } from "./json";
export { renderMarkdownReport } from "./markdown";
export { renderSarifReport } from "./sarif";

export type ReportFormat = "json" | "markdown" | "sarif";

export function renderReport(report: CodeDecayReport, format: ReportFormat): string {
  if (format === "json") {
    return renderJsonReport(report);
  }

  if (format === "sarif") {
    return renderSarifReport(report);
  }

  return renderMarkdownReport(report);
}
