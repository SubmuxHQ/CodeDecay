import type { FileChange, Finding, RiskLevel } from "@submuxhq/codedecay-core";
import { isSourcePath, isTestPath } from "../classifiers/paths";

const FRAGILE_PATTERNS: Array<{ id: string; title: string; pattern: RegExp; severity: RiskLevel }> = [
  {
    id: "typescript-any",
    title: "New unchecked TypeScript escape hatch",
    pattern: /\b(as\s+any|:\s*any|<any>)/,
    severity: "medium"
  },
  {
    id: "compiler-suppression",
    title: "New compiler or linter suppression",
    pattern: /(@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore)/,
    severity: "medium"
  },
  {
    id: "silent-failure",
    title: "Potential silent failure path",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}|return\s+null\s*;?\s*\/\/\s*(ignore|fallback)/i,
    severity: "high"
  }
];

export function detectFragilePatterns(changedFiles: FileChange[]): Finding[] {
  const findings: Finding[] = [];

  for (const change of changedFiles.filter((file) => isSourcePath(file.path) && !isTestPath(file.path))) {
    for (const line of change.addedLines) {
      for (const pattern of FRAGILE_PATTERNS) {
        if (pattern.pattern.test(line.content)) {
          findings.push({
            ruleId: pattern.id,
            title: pattern.title,
            description: `${change.path} adds code that can hide type, lint, or runtime failures.`,
            severity: pattern.severity,
            category: "decay",
            file: change.path,
            line: line.line
          });
        }
      }
    }
  }

  return findings;
}
