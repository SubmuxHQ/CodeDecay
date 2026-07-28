import { parse } from "@babel/parser";
import { getNodeType, type AstNode } from "../ast/traverse";

const EXECUTABLE_NODE_TYPES = new Set([
  "AssignmentExpression",
  "AwaitExpression",
  "BinaryExpression",
  "CallExpression",
  "ConditionalExpression",
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "IfStatement",
  "LogicalExpression",
  "NewExpression",
  "OptionalCallExpression",
  "SwitchStatement",
  "ThrowStatement",
  "UnaryExpression",
  "UpdateExpression",
  "WhileStatement",
  "YieldExpression"
]);

const TYPE_ONLY_NODE_TYPES = new Set([
  "ImportDeclaration",
  "TSDeclareFunction",
  "TSEnumDeclaration",
  "TSImportEqualsDeclaration",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSTypeAliasDeclaration"
]);

export function hasExecutableImplementationBetween(
  content: string,
  startLine: number,
  endLine: number
): boolean {
  for (const line of executableImplementationLines(content)) {
    if (line >= startLine && line <= endLine) {
      return true;
    }
  }
  return false;
}

export function executableImplementationLines(content: string): Set<number> {
  const lines = new Set<number>();

  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });

    collectExecutableLines(ast, false, lines);
  } catch {
    // Unsupported or incomplete syntax should not create a high-severity
    // copied-implementation finding.
  }

  return lines;
}

function collectExecutableLines(
  value: unknown,
  insideTypeOnlySyntax: boolean,
  lines: Set<number>
): void {
  if (Array.isArray(value)) {
    collectArrayLines(value, insideTypeOnlySyntax, lines);
    return;
  }

  const node = readNode(value);
  if (!node) {
    return;
  }

  const type = getNodeType(node);
  const typeOnly = isTypeOnlySyntax(type, insideTypeOnlySyntax);
  recordExecutableLine(node, type, typeOnly, lines);
  collectChildLines(node, typeOnly, lines);
}

function collectArrayLines(values: unknown[], insideTypeOnlySyntax: boolean, lines: Set<number>): void {
  for (const value of values) {
    collectExecutableLines(value, insideTypeOnlySyntax, lines);
  }
}

function collectChildLines(node: AstNode, insideTypeOnlySyntax: boolean, lines: Set<number>): void {
  for (const [key, child] of Object.entries(node)) {
    if (isMetadataKey(key)) {
      continue;
    }

    collectExecutableLines(child, insideTypeOnlySyntax, lines);
  }
}

function isTypeOnlySyntax(type: string | undefined, insideTypeOnlySyntax: boolean): boolean {
  return (
    insideTypeOnlySyntax ||
    (type !== undefined && (TYPE_ONLY_NODE_TYPES.has(type) || type.startsWith("TS")))
  );
}

function recordExecutableLine(
  node: AstNode,
  type: string | undefined,
  insideTypeOnlySyntax: boolean,
  lines: Set<number>
): void {
  if (insideTypeOnlySyntax || type === undefined || !EXECUTABLE_NODE_TYPES.has(type)) {
    return;
  }

  const line = startLine(node);
  if (line !== undefined) {
    lines.add(line);
  }
}

function startLine(node: AstNode): number | undefined {
  const location = readNode(node.loc);
  const start = readNode(location?.start);

  return typeof start?.line === "number" ? start.line : undefined;
}

function readNode(value: unknown): AstNode | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as AstNode) : undefined;
}

function isMetadataKey(key: string): boolean {
  return [
    "comments",
    "end",
    "extra",
    "innerComments",
    "leadingComments",
    "loc",
    "start",
    "trailingComments"
  ].includes(key);
}
