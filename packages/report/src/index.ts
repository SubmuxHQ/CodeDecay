import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { renderJsonReport } from "./json";
import { renderMarkdownReport } from "./markdown";
import { renderPrCommentReport } from "./markdown/pr-comment";
import { renderSarifReport } from "./sarif";

export { renderJsonReport } from "./json";
export { renderMarkdownReport } from "./markdown";
export { renderPrCommentReport } from "./markdown/pr-comment";
export { renderSarifReport } from "./sarif";

export type ReportFormat = "json" | "markdown" | "sarif" | "pr-comment";

export function renderReport(report: CodeDecayReport, format: ReportFormat): string {
  if (format === "json") {
    return renderJsonReport(report);
  }

  if (format === "sarif") {
    return renderSarifReport(report);
  }

  if (format === "pr-comment") {
    return renderPrCommentReport(report);
  }

  return renderMarkdownReport(report);
}
