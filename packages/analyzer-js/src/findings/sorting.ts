import type { Finding } from "@submuxhq/codedecay-core";

export function dedupeFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();

  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.file ?? ""}:${finding.line ?? ""}:${finding.description}`;
    if (!byKey.has(key)) {
      byKey.set(key, finding);
    }
  }

  return [...byKey.values()];
}
