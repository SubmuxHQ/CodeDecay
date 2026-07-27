import {
  identifierName,
  isAstNode,
  nodeLine,
  nodeType,
  parseJavaScript,
  sourceLine,
  walkAst,
  type AstNode,
  type ParseQuality
} from "./ast";
import type { JavaScriptSecurityMatch } from "./types";
import { stripComments } from "../utils";

const PLACEHOLDER_MARKERS = [
  "example",
  "placeholder",
  "changeme",
  "test-secret",
  "dummy",
  "sample",
  "fake",
  "not-a-secret",
  "redacted"
];

const METADATA_NAME_TOKENS = new Set([
  "description",
  "example",
  "fixture",
  "label",
  "matcher",
  "message",
  "pattern",
  "regex",
  "rule",
  "ruleid",
  "test",
  "title"
]);

export function findHardcodedSecretMatches(content: string): JavaScriptSecurityMatch[] {
  const parsed = parseJavaScript(content);
  if (!parsed.ast) {
    return findHeuristicMatches(content);
  }

  const matches = new Map<string, JavaScriptSecurityMatch>();
  walkAst(parsed.ast, (node) => {
    const assignment = credentialAssignment(node);
    if (!assignment || !isCredentialName(assignment.name)) {
      return;
    }

    const literal = stringLiteralValue(assignment.value);
    if (!literal || literal.length < 12 || isPlaceholder(literal)) {
      return;
    }

    const line = nodeLine(node);
    if (!line) {
      return;
    }

    const match = createParsedMatch({
      content,
      line,
      name: assignment.name,
      quality: parsed.quality
    });
    matches.set(`${line}:${assignment.name}`, match);
  });

  return [...matches.values()];
}

function credentialAssignment(
  node: AstNode
): { name: string; value: AstNode } | undefined {
  const type = nodeType(node);

  if (type === "VariableDeclarator") {
    return assignment(identifierName(asNode(node.id)), asNode(node.init));
  }

  if (type === "AssignmentExpression") {
    return assignment(assignmentTargetName(asNode(node.left)), asNode(node.right));
  }

  if (
    type === "ObjectProperty" ||
    type === "ClassProperty" ||
    type === "ClassPrivateProperty" ||
    type === "PropertyDefinition"
  ) {
    if (node.computed === true) {
      return undefined;
    }
    return assignment(identifierName(asNode(node.key)), asNode(node.value));
  }

  return undefined;
}

function assignment(
  name: string | undefined,
  value: AstNode | undefined
): { name: string; value: AstNode } | undefined {
  if (!name || !value) {
    return undefined;
  }
  return { name, value };
}

function assignmentTargetName(node: AstNode | undefined): string | undefined {
  const direct = identifierName(node);
  if (direct) {
    return direct;
  }

  if (nodeType(node) !== "MemberExpression" && nodeType(node) !== "OptionalMemberExpression") {
    return undefined;
  }

  const property = asNode(node?.property);
  if (node?.computed === true) {
    return nodeType(property) === "StringLiteral" ? identifierName(property) : undefined;
  }
  return identifierName(property);
}

function stringLiteralValue(node: AstNode | undefined): string | undefined {
  const unwrapped = unwrapExpression(node);
  if (nodeType(unwrapped) === "StringLiteral" && typeof unwrapped?.value === "string") {
    return unwrapped.value;
  }

  if (nodeType(unwrapped) !== "TemplateLiteral") {
    return undefined;
  }

  const expressions = Array.isArray(unwrapped?.expressions) ? unwrapped.expressions : [];
  const quasis = Array.isArray(unwrapped?.quasis) ? unwrapped.quasis : [];
  if (expressions.length !== 0 || quasis.length !== 1) {
    return undefined;
  }

  const value = isAstNode(quasis[0]) && isAstNode(quasis[0].value)
    ? quasis[0].value
    : undefined;
  if (typeof value?.cooked === "string") {
    return value.cooked;
  }
  return typeof value?.raw === "string" ? value.raw : undefined;
}

function unwrapExpression(node: AstNode | undefined): AstNode | undefined {
  let current = node;
  while (
    current &&
    [
      "TSAsExpression",
      "TSSatisfiesExpression",
      "TSTypeAssertion",
      "TypeCastExpression",
      "ParenthesizedExpression"
    ].includes(nodeType(current) ?? "")
  ) {
    current = asNode(current.expression);
  }
  return current;
}

function isCredentialName(name: string): boolean {
  const tokens = splitName(name);
  if (tokens.some((token) => METADATA_NAME_TOKENS.has(token))) {
    return false;
  }

  const compact = tokens.join("");
  return (
    tokens.some((token) => ["secret", "password", "passwd", "pwd"].includes(token)) ||
    compact.includes("apikey") ||
    compact.includes("accesstoken") ||
    compact.includes("privatekey")
  );
}

function splitName(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

function createParsedMatch(input: {
  content: string;
  line: number;
  name: string;
  quality: ParseQuality;
}): JavaScriptSecurityMatch {
  const direct = input.quality === "parsed";
  return {
    line: input.line,
    text: sourceLine(input.content, input.line),
    severity: direct ? "high" : "medium",
    confidence: direct ? "direct" : "heuristic",
    evidence: direct
      ? `Parsed syntax confirms credential field "${input.name}" is assigned a non-placeholder string literal.`
      : `Parser recovery found credential field "${input.name}" assigned a non-placeholder string literal; confirm the malformed source before treating it as direct evidence.`
  };
}

function findHeuristicMatches(content: string): JavaScriptSecurityMatch[] {
  const originalLines = content.split(/\n/);
  const codeLines = stripComments(content).split(/\n/);
  const matches: JavaScriptSecurityMatch[] = [];

  for (const [index, codeLine] of codeLines.entries()) {
    const assignmentMatch = codeLine.match(
      /(?:\b(?:const|let|var)\s+)?(?:[$A-Z_a-z][$\w]*\s*\.\s*)?([$A-Z_a-z][$\w]*)\s*(?:=|:)\s*(["'])([^"'\r\n]{12,})\2/i
    );
    const name = assignmentMatch?.[1];
    const literal = assignmentMatch?.[3];
    if (!name || !literal || !isCredentialName(name) || isPlaceholder(literal)) {
      continue;
    }

    matches.push({
      line: index + 1,
      text: originalLines[index]?.trim() ?? "",
      severity: "medium",
      confidence: "heuristic",
      evidence:
        `Heuristic parse fallback found credential field "${name}" and a long string literal on the same line; parse the complete source to confirm direct evidence.`
    });
  }

  return matches;
}

function asNode(value: unknown): AstNode | undefined {
  return isAstNode(value) && !Array.isArray(value) ? value : undefined;
}
