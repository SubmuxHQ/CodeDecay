import type { RedteamVerificationSummary } from "../../types";
import { formatExecutionStatus, formatProofGrade, formatVerificationStatus } from "../helpers";

export function appendVerification(lines: string[], verification: RedteamVerificationSummary): void {
  lines.push("### Verification Evidence", "");
  lines.push(`**Status:** ${formatVerificationStatus(verification.status)}`);
  lines.push(`**Commands executed:** ${verification.commandsExecuted ? "yes" : "no"}`, "");

  lines.push(
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${verification.total} |`,
    `| Passed | ${verification.passed} |`,
    `| Failed | ${verification.failed} |`,
    `| Blocked | ${verification.blocked} |`,
    `| Timed out | ${verification.timedOut} |`,
    `| Errors | ${verification.errors} |`,
    `| Skipped | ${verification.skipped} |`,
    `| Duration | ${verification.durationMs}ms |`,
    ""
  );

  if (verification.notes.length > 0) {
    for (const note of verification.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  if (verification.checks.length === 0) {
    lines.push("No configured execution checks were included in this report.", "");
    return;
  }

  for (const check of verification.checks.slice(0, 12)) {
    lines.push(
      `- **${check.name}** (${check.kind}) ${formatExecutionStatus(check.status)}; proof: ${formatProofGrade(check.proof)}; command: \`${check.command}\``
    );
    if (check.exitCode !== undefined) {
      lines.push(`  - Exit code: ${check.exitCode}`);
    }
    if (check.failure) {
      lines.push(`  - Failure: ${check.failure}`);
    }
    if (check.summary) {
      lines.push(`  - Summary: ${check.summary}`);
    }
    if (check.differentialStatus) {
      lines.push(`  - Differential status: ${check.differentialStatus}`);
    }
    if (check.differences && check.differences.length > 0) {
      lines.push(`  - Differences: ${check.differences.join("; ")}`);
    }
    if (check.rerunCommand) {
      lines.push(`  - Rerun: \`${check.rerunCommand}\``);
    }
    if (check.artifacts) {
      lines.push(
        `  - Artifacts: \`${check.artifacts.directory}\``,
        `    - Base result: \`${check.artifacts.baseResult}\``,
        `    - Head result: \`${check.artifacts.headResult}\``
      );
    }
  }
  lines.push("");
}
