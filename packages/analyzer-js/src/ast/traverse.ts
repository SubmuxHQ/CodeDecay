export type AstNode = Record<string, unknown>;

export function walk(node: unknown, visitor: (node: AstNode) => void): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visitor);
    }
    return;
  }

  const typedNode = node as AstNode;
  visitor(typedNode);

  for (const [key, value] of Object.entries(typedNode)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "extra" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }

    if (value && typeof value === "object") {
      walk(value, visitor);
    }
  }
}

export function getNodeType(node: unknown): string | undefined {
  return typeof (node as { type?: unknown } | undefined)?.type === "string"
    ? ((node as { type: string }).type)
    : undefined;
}
