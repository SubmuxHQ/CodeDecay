import type { LanguageAnalysisSummary } from "@submuxhq/codedecay-core";

export function appendLanguageAnalysis(lines: string[], analysis: LanguageAnalysisSummary | undefined): void {
  if (!analysis) {
    return;
  }

  lines.push("### Language And Parser Coverage", "");
  lines.push(`- Source files classified: ${analysis.files.length}`);
  lines.push(`- Fully supported parser files: ${analysis.supportedFiles.length}`);
  lines.push(`- Limited files: ${analysis.limitedFiles.length}`);
  lines.push(`- Unsupported files: ${analysis.unsupportedFiles.length}`);

  const limitedOrUnsupported = analysis.files.filter((file) => file.status !== "supported");
  if (limitedOrUnsupported.length > 0) {
    lines.push("");
    for (const file of limitedOrUnsupported.slice(0, 8)) {
      const limitation = file.limitation ? `: ${file.limitation}` : "";
      lines.push(`- ${file.status} \`${file.path}\` (${file.language}, ${file.parser})${limitation}`);
    }
  }

  lines.push("");
}
