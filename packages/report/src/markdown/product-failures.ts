import type { ProductFailureBundle } from "@submuxhq/codedecay-core";
import { riskBadge } from "./helpers";

export function appendProductFailureBundles(lines: string[], bundles: ProductFailureBundle[] | undefined): void {
  if (!bundles || bundles.length === 0) {
    return;
  }

  lines.push("### Product Failure Bundles", "");
  for (const bundle of bundles.slice(0, 8)) {
    const confidence =
      bundle.classificationConfidence === undefined ? "" : ` (${Math.round(bundle.classificationConfidence * 100)}% confidence)`;
    const files = bundle.impactedFiles.length > 0 ? bundle.impactedFiles.map((file) => `\`${file}\``).join(", ") : "none";
    lines.push(`#### ${riskBadge(bundle.priority)} ${bundle.title}`, "");
    lines.push(`- Bundle: \`${bundle.id}\``);
    lines.push(`- Check: \`${bundle.checkId}\` (${bundle.checkKind})`);
    lines.push(`- Target: \`${bundle.target.id}\`${bundle.target.baseUrl ? ` at \`${bundle.target.baseUrl}\`` : ""}`);
    lines.push(`- Classification: ${bundle.classification.replaceAll("-", " ")}${confidence}`);
    for (const evidence of bundle.classificationEvidence ?? []) {
      lines.push(`- Classification evidence: ${evidence}`);
    }
    lines.push(`- Failed step ${bundle.failedStep.index}: ${bundle.failedStep.label}`);
    lines.push(`- Expected: ${bundle.expected}`);
    lines.push(`- Actual: ${bundle.actual}`);
    lines.push(`- Impacted files: ${files}`);
    if (bundle.rootCauseHypothesis) {
      lines.push(`- Root-cause hypothesis: ${bundle.rootCauseHypothesis}`);
    }
    lines.push(`- Rerun: \`${bundle.rerunCommand}\``);

    if (bundle.artifacts.length > 0) {
      lines.push("- Artifacts:");
      for (const artifact of bundle.artifacts.slice(0, 6)) {
        const label = artifact.label ? `${artifact.label} ` : "";
        const location = artifact.path ? `\`${artifact.path}\`` : artifact.description ?? "inline artifact";
        lines.push(`- ${label}${artifact.kind}: ${location}`);
      }
    }

    if (bundle.suggestedFixTasks.length > 0) {
      lines.push("- Suggested fix tasks:");
      for (const task of bundle.suggestedFixTasks.slice(0, 5)) {
        lines.push(`- ${task}`);
      }
    }

    lines.push("");
  }
}
