import type { RiskLevel, SecurityCandidate } from "@submuxhq/codedecay-core";

export interface LineMatch {
  line: number;
  text: string;
}

export function lineMatches(content: string, predicate: (line: string, lowerLine: string) => boolean): LineMatch[] {
  return content.split(/\n/).flatMap((line, index) => {
    const lowerLine = line.toLowerCase();
    return predicate(line, lowerLine) ? [{ line: index + 1, text: line.trim() }] : [];
  });
}

export function createCandidate(input: {
  ruleId: string;
  cwe?: string | undefined;
  title: string;
  description: string;
  severity: RiskLevel;
  confidence: SecurityCandidate["confidence"];
  file: string;
  line?: number | undefined;
  snippet?: string | undefined;
  evidence: string;
}): SecurityCandidate {
  const candidate: SecurityCandidate = {
    ruleId: input.ruleId,
    title: input.title,
    description: input.description,
    severity: input.severity,
    confidence: input.confidence,
    file: input.file,
    evidence: input.evidence
  };

  if (input.cwe !== undefined) {
    candidate.cwe = input.cwe;
  }

  if (input.line !== undefined) {
    candidate.line = input.line;
  }

  if (input.snippet !== undefined) {
    candidate.snippet = input.snippet;
  }

  return candidate;
}

export function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function maskStringLiterals(line: string): string {
  let output = "";
  let quote: "'" | "\"" | "`" | undefined;
  let escaped = false;

  for (const char of line) {
    if (quote !== undefined) {
      if (escaped) {
        output += " ";
        escaped = false;
        continue;
      }

      if (char === "\\") {
        output += " ";
        escaped = true;
        continue;
      }

      if (char === quote) {
        output += char;
        quote = undefined;
        continue;
      }

      output += " ";
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      output += char;
      continue;
    }

    output += char;
  }

  return output;
}

export function hasRouteEntryPoint(filePath: string, content: string): boolean {
  const normalized = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (
    normalized.includes("/api/") ||
    normalized.includes("/routes/") ||
    normalized.includes("/controllers/") ||
    normalized.endsWith("/route.ts") ||
    normalized.endsWith("/route.js")
  ) {
    return (
      containsAny(lowerContent, ["export async function get", "export async function post", "export function get", "export function post"]) ||
      containsAny(lowerContent, ["router.get", "router.post", "app.get", "app.post", "fastify.get", "fastify.post"])
    );
  }

  return false;
}
