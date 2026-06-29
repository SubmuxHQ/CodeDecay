import type { ProductFailureBundle } from "@submuxhq/codedecay-core";

export function renderProductDashboardFailureMarkdown(bundle: ProductFailureBundle): string {
  return [
    `# ${bundle.title}`,
    "",
    `- Classification: ${bundle.classification}${bundle.classificationConfidence !== undefined ? ` (${Math.round(bundle.classificationConfidence * 100)}% confidence)` : ""}`,
    `- Priority: ${bundle.priority}`,
    `- Target: ${bundle.target.id}${bundle.target.baseUrl ? ` (${bundle.target.baseUrl})` : ""}`,
    `- Check: ${bundle.checkId} (${bundle.checkKind})`,
    `- Expected: ${bundle.expected}`,
    `- Actual: ${bundle.actual}`,
    `- Rerun: \`${bundle.rerunCommand}\``,
    "",
    "## Evidence",
    "",
    ...(bundle.classificationEvidence ?? ["No classification evidence recorded."]).map((evidence) => `- ${evidence}`),
    "",
    "## Repair Tasks",
    "",
    ...bundle.suggestedFixTasks.map((task) => `- ${task}`),
    ""
  ].join("\n");
}
