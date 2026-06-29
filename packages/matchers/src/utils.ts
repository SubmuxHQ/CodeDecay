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

export function hasUserInputMarker(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /\b(?:req|request)\s*\./.test(normalized) ||
    /\b(?:req|request)\s*\[/.test(normalized) ||
    /\b(?:params|body|headers|searchparams)\b/.test(normalized) ||
    normalized.includes("process.argv") ||
    normalized.includes("${")
  );
}

export function hasTemplateUserInputExpression(line: string): boolean {
  let quote: "'" | "\"" | "`" | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = undefined;
        continue;
      }

      if (quote === "`" && char === "$" && line[index + 1] === "{") {
        const end = line.indexOf("}", index + 2);
        if (end > index && hasUserInputMarker(line.slice(index + 2, end))) {
          return true;
        }
      }

      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
    }
  }

  return false;
}

export function findParameterTaintedSinkLines(content: string, sinkMarkers: string[]): LineMatch[] {
  const parameters = collectFunctionParameters(content);
  if (parameters.length === 0) {
    return [];
  }

  const matches: LineMatch[] = [];
  const lines = content.split(/\n/);
  for (const [index, line] of lines.entries()) {
    const codeLine = maskStringLiterals(line).toLowerCase();
    if (!containsAny(codeLine, sinkMarkers)) {
      continue;
    }

    const sinkArgumentText = codeAfterFirstSink(codeLine, sinkMarkers);
    const hasParameter = parameters.some((parameter) => containsIdentifier(sinkArgumentText, parameter));
    if (hasParameter) {
      matches.push({ line: index + 1, text: line.trim() });
    }
  }

  return matches;
}

function codeAfterFirstSink(codeLine: string, sinkMarkers: string[]): string {
  const indexes = sinkMarkers
    .map((marker) => {
      const index = codeLine.indexOf(marker);
      return index >= 0 ? { index, marker } : undefined;
    })
    .filter((match): match is { index: number; marker: string } => match !== undefined)
    .sort((left, right) => left.index - right.index);

  const first = indexes[0];
  if (!first) {
    return "";
  }

  return codeLine.slice(first.index + first.marker.length);
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

function collectFunctionParameters(content: string): string[] {
  const parameters = new Set<string>();
  for (const line of content.split(/\n/)) {
    for (const parameterList of extractParameterLists(line)) {
      for (const parameter of parameterList.split(",")) {
        const name = normalizeParameterName(parameter);
        if (name) {
          parameters.add(name.toLowerCase());
        }
      }
    }
  }
  return [...parameters];
}

function extractParameterLists(line: string): string[] {
  const lists: string[] = [];
  const functionMatch = line.match(/\bfunction\s+[$A-Z_a-z][$\w]*\s*\(([^)]*)\)/);
  if (functionMatch?.[1]) {
    lists.push(functionMatch[1]);
  }

  const arrowMatch = line.match(/(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:async\s*)?\(?([^)=]*)\)?\s*=>/);
  if (arrowMatch?.[1]) {
    lists.push(arrowMatch[1]);
  }

  return lists;
}

function normalizeParameterName(parameter: string): string | undefined {
  const withoutDefault = parameter.split("=")[0]?.trim() ?? "";
  const withoutType = withoutDefault.split(":")[0]?.trim() ?? "";
  if (!/^[$A-Z_a-z][$\w]*$/.test(withoutType)) {
    return undefined;
  }
  return withoutType;
}

function containsIdentifier(value: string, identifier: string): boolean {
  let start = value.indexOf(identifier);
  while (start >= 0) {
    const before = start === 0 ? "" : value[start - 1] ?? "";
    const after = value[start + identifier.length] ?? "";
    if (!isIdentifierChar(before) && !isIdentifierChar(after)) {
      return true;
    }
    start = value.indexOf(identifier, start + identifier.length);
  }

  return false;
}

function isIdentifierChar(char: string): boolean {
  return (
    char === "$" ||
    char === "_" ||
    (char >= "0" && char <= "9") ||
    (char >= "A" && char <= "Z") ||
    (char >= "a" && char <= "z")
  );
}
