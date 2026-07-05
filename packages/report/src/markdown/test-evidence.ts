import type { ChangedPathTestProofMap, ChangedPathTestProofStatus, TestEvidenceSummary } from "@submuxhq/codedecay-core";

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

export function appendTestProofMap(lines: string[], testProofMap: ChangedPathTestProofMap | undefined): void {
  if (!testProofMap || testProofMap.entries.length === 0) {
    return;
  }

  lines.push("### Changed Path Test Proof", "");
  lines.push(
    "| Status | Count |",
    "| --- | ---: |",
    `| Runtime-proven | ${testProofMap.summary.provenByRuntimeCoverage} |`,
    `| Static-only | ${testProofMap.summary.referencedOnlyStatically} |`,
    `| Weakened by mocks | ${testProofMap.summary.weakenedByMocking} |`,
    `| Unproven | ${testProofMap.summary.unproven} |`,
    ""
  );

  for (const entry of testProofMap.entries.slice(0, 8)) {
    const target = entry.symbol ? `${entry.file}#${entry.symbol}` : entry.file;
    lines.push(`- **${formatProofStatus(entry.status)}** \`${target}\` (${entry.evidence}, ${entry.proof})`);
    for (const reason of entry.reasons.slice(0, 2)) {
      lines.push(`  - Evidence: ${reason}`);
    }
    if (entry.staticReferences.length > 0) {
      lines.push(`  - Static references: ${entry.staticReferences.map((file) => `\`${file}\``).join(", ")}`);
    }
    if (entry.weakenedByMocks.length > 0) {
      lines.push(`  - Mocked in: ${entry.weakenedByMocks.map((file) => `\`${file}\``).join(", ")}`);
    }
    lines.push(`  - Repair task: ${entry.repairTask}`);
  }

  if (testProofMap.entries.length > 8) {
    lines.push(`- ...and ${testProofMap.entries.length - 8} more changed path proof entries`);
  }

  lines.push("");
}

function formatProofStatus(status: ChangedPathTestProofStatus): string {
  switch (status) {
    case "proven_by_runtime_coverage":
      return "Runtime-proven";
    case "referenced_only_statically":
      return "Static-only";
    case "weakened_by_mocking":
      return "Weakened by mocks";
    case "unproven":
      return "Unproven";
  }
}
