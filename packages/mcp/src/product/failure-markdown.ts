import type { ProductFailureBundle } from "@submuxhq/codedecay-core";

export function appendProductFailureBundleMarkdown(lines: string[], failures: ProductFailureBundle[]): void {
  if (failures.length === 0) {
    lines.push("No product failures found.", "");
    return;
  }

  lines.push("### Failures", "");
  for (const failure of failures) {
    lines.push(`- ${formatPriority(failure.priority)} **${failure.title}** (\`${failure.checkId}\`, ${failure.checkKind})`);
    lines.push(`  - Target: \`${failure.target.id}\`${failure.target.baseUrl ? ` at \`${failure.target.baseUrl}\`` : ""}`);
    lines.push(
      `  - Classification: ${failure.classification}${failure.classificationConfidence !== undefined ? ` (${Math.round(failure.classificationConfidence * 100)}% confidence)` : ""}`
    );
    for (const evidence of failure.classificationEvidence ?? []) {
      lines.push(`  - Evidence: ${evidence}`);
    }
    lines.push(`  - Expected: ${failure.expected}`);
    lines.push(`  - Actual: ${failure.actual}`);
    for (const task of failure.suggestedFixTasks) {
      lines.push(`  - Repair task: ${task}`);
    }
    lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
  }
  lines.push("");
}

function formatPriority(priority: ProductFailureBundle["priority"]): string {
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
}
