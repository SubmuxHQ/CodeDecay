import type { Finding } from "@submuxhq/codedecay-core";

export function appendFindings(lines: string[], title: string, findings: Finding[]): void {
  if (findings.length === 0) {
    return;
  }

  lines.push(`### ${title}`, "");
  for (const finding of findings) {
    const location = finding.file ? ` (\`${finding.file}${finding.line ? `:${finding.line}` : ""}\`)` : "";
    lines.push(`- **${finding.title}**${location}: ${finding.description}`);
  }
  lines.push("");
}
