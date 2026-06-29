import type { ProductFailureBundle } from "@submuxhq/codedecay-core";
import { formatRisk } from "../helpers";

export function appendProductFailures(lines: string[], bundles: ProductFailureBundle[]): void {
  if (bundles.length === 0) {
    return;
  }

  lines.push("### Product Verification Failures", "");
  for (const bundle of bundles.slice(0, 8)) {
    const files = bundle.impactedFiles.length > 0 ? bundle.impactedFiles.map((file) => `\`${file}\``).join(", ") : "none";
    lines.push(`- ${formatRisk(bundle.priority)} **${bundle.title}** (\`${bundle.checkId}\`, ${bundle.checkKind})`);
    lines.push(`  - Target: \`${bundle.target.id}\`${bundle.target.baseUrl ? ` at \`${bundle.target.baseUrl}\`` : ""}`);
    lines.push(`  - Classification: ${bundle.classification.replaceAll("-", " ")}`);
    lines.push(`  - Failed step ${bundle.failedStep.index}: ${bundle.failedStep.label}`);
    lines.push(`  - Expected: ${bundle.expected}`);
    lines.push(`  - Actual: ${bundle.actual}`);
    lines.push(`  - Impacted files: ${files}`);
    lines.push(`  - Rerun: \`${bundle.rerunCommand}\``);
  }
  lines.push("");
}
