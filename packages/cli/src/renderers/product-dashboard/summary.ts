import type { ConfigFormat } from "../../types";
import type { ProductDashboard } from "./types";

export function renderProductDashboardSummary(dashboard: ProductDashboard, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(dashboard, null, 2)}\n`;
  }

  return [
    "## CodeDecay Product Dashboard",
    "",
    `Dashboard written to \`${dashboard.outputDir}\`.`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Runs | ${dashboard.summary.runs} |`,
    `| Targets | ${dashboard.summary.targets} |`,
    `| Failures | ${dashboard.summary.failures} |`,
    `| Confirmed regressions | ${dashboard.summary.confirmedRegressions} |`,
    `| Likely flaky | ${dashboard.summary.flaky} |`,
    "",
    dashboard.failures.length > 0 ? "Open `index.html` for failure bundle links and rerun commands." : "No product failures found.",
    ""
  ].join("\n");
}
