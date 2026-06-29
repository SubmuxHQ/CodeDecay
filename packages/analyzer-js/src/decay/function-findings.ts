import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileChange, Finding } from "@submuxhq/codedecay-core";
import { analyzeFunctions } from "../functions/metrics";

export function detectFunctionMetricFindings(rootDir: string, changedSourceFiles: FileChange[]): Finding[] {
  const findings: Finding[] = [];

  for (const sourceChange of changedSourceFiles) {
    const content = readChangedFile(rootDir, sourceChange.path);
    if (!content) {
      continue;
    }

    const metrics = analyzeFunctions(sourceChange, content);
    for (const metric of metrics) {
      if (metric.lines >= 120) {
        findings.push({
          ruleId: "large-function",
          title: "Large changed function",
          description: `${metric.name} spans ${metric.lines} lines, which increases review and regression risk.`,
          severity: metric.lines >= 180 ? "high" : "medium",
          category: "decay",
          file: metric.file,
          line: metric.line
        });
      }

      if (metric.complexity >= 12) {
        findings.push({
          ruleId: "high-complexity",
          title: "High complexity in changed function",
          description: `${metric.name} has estimated cyclomatic complexity ${metric.complexity}.`,
          severity: metric.complexity >= 20 ? "high" : "medium",
          category: "decay",
          file: metric.file,
          line: metric.line
        });
      }
    }
  }

  return findings;
}

function readChangedFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}
