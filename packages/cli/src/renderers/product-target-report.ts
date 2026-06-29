import type { ConfigFormat, ProductTargetReport } from "../types";
import { renderProductTargetMarkdown } from "./product-target/markdown";

export function renderProductTargetReport(report: ProductTargetReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderProductTargetMarkdown(report);
}

export { formatCommandExecutionStatus, formatProductStartStatus, formatProductStatus } from "./product-target/format";
