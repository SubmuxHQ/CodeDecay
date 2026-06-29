import type { TestEvidenceSummary } from "@submuxhq/codedecay-core";

export function appendTestEvidence(lines: string[], testEvidence: TestEvidenceSummary | undefined): void {
  if (!testEvidence) {
    return;
  }

  lines.push("### Test Evidence", "");
  lines.push(`- Mode: ${testEvidence.mode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"}`);
  if (testEvidence.sources.length > 0) {
    lines.push(`- Sources: ${testEvidence.sources.map((source) => `\`${source.path}\` (${source.kind})`).join(", ")}`);
  } else {
    lines.push("- Sources: none");
  }

  if (testEvidence.changedSources.length > 0) {
    lines.push("- Changed source coverage:");
    for (const entry of testEvidence.changedSources.slice(0, 8)) {
      const measured =
        entry.measuredLines.length > 0
          ? `measured ${entry.measuredLines.join(", ")}`
          : "no measurable changed lines";
      lines.push(`- \`${entry.path}\`: ${entry.status.replaceAll("_", " ")} (${measured})`);
    }
  }

  if (testEvidence.notes.length > 0) {
    lines.push("- Notes:");
    for (const note of testEvidence.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
}
