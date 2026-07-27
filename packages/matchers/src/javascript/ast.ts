import { parse } from "@babel/parser";

export type AstNode = Record<string, unknown>;
export type ParseQuality = "parsed" | "recovered" | "unparsed";

export interface ParsedJavaScript {
  ast?: AstNode | undefined;
  quality: ParseQuality;
}

export function parseJavaScript(content: string): ParsedJavaScript {
  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    }) as unknown as AstNode;
    const errors = Array.isArray(ast.errors) ? ast.errors : [];

    return {
      ast,
      quality: errors.length === 0 ? "parsed" : "recovered"
    };
  } catch {
    return { quality: "unparsed" };
  }
}

export function walkAst(
  node: unknown,
  visitor: (node: AstNode, parent: AstNode | undefined) => void,
  parent?: AstNode
): void {
  if (!isAstNode(node)) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkAst(item, visitor, parent);
    }
    return;
  }

  visitor(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (IGNORED_KEYS.has(key)) {
      continue;
    }
    walkAst(value, visitor, node);
  }
}

export function isAstNode(value: unknown): value is AstNode {
  return value !== null && typeof value === "object";
}

export function nodeType(node: AstNode | undefined): string | undefined {
  return typeof node?.type === "string" ? node.type : undefined;
}

export function nodeLine(node: AstNode): number | undefined {
  const loc = isAstNode(node.loc) ? node.loc : undefined;
  const start = isAstNode(loc?.start) ? loc.start : undefined;
  return typeof start?.line === "number" ? start.line : undefined;
}

export function sourceLine(content: string, line: number): string {
  return content.split(/\n/)[line - 1]?.trim() ?? "";
}

export function identifierName(node: AstNode | undefined): string | undefined {
  if (nodeType(node) === "Identifier" && typeof node?.name === "string") {
    return node.name;
  }

  if (nodeType(node) === "StringLiteral" && typeof node?.value === "string") {
    return node.value;
  }

  return undefined;
}

const IGNORED_KEYS = new Set([
  "loc",
  "start",
  "end",
  "extra",
  "errors",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments"
]);
