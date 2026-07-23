import type { RequirementTraceGraph, RequirementTraceStatus } from "@submuxhq/codedecay-core";

export function appendRequirementTrace(lines: string[], trace: RequirementTraceGraph | undefined): void {
  if (!trace) {
    return;
  }
  lines.push(
    "### Acceptance Criteria Trace",
    "",
    "| Requirement | Status | Implementation | Evidence |",
    "| --- | --- | --- | --- |"
  );
  for (const criterion of trace.criteria) {
    const implementation = [
      ...criterion.implementation.routes,
      ...criterion.implementation.files
    ].slice(0, 3).join(", ") || "none";
    const evidence = criterion.evidence
      .filter((item) => item.outcome === "passed" || item.outcome === "failed" || item.outcome === "missing")
      .slice(0, 2)
      .map((item) => item.source)
      .join(", ") || "mapping only";
    lines.push(`| ${criterion.requirementId} | ${statusLabel(criterion.status)} | ${implementation} | ${evidence} |`);
  }
  lines.push("");
}

function statusLabel(status: RequirementTraceStatus): string {
  const label = status.replaceAll("-", " ");
  return `${label[0]?.toUpperCase() ?? ""}${label.slice(1)}`;
}
