import type { ProductTargetReport } from "../../types";

export function appendProductSafetySection(lines: string[], report: ProductTargetReport): void {
  lines.push(
    "",
    "### Safety",
    "",
    `- Commands executed: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- Browser automation ran: ${report.safety.browserAutomationRan ? "yes" : "no"}`,
    `- Generated tests ran: ${report.safety.generatedTestsRan ? "yes" : "no"}`,
    `- Startup commands allowed: ${report.safety.startupCommandsAllowed ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    ""
  );

  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
}
