import { getNodeType } from "../../ast/traverse";

export function isFunctionNode(node: unknown): boolean {
  const type = getNodeType(node);
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression" ||
    type === "ObjectMethod" ||
    type === "ClassMethod" ||
    type === "ClassPrivateMethod"
  );
}

export function readNodeLoc(node: unknown): { start: { line: number }; end: { line: number } } | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }

  const loc = (node as { loc?: unknown }).loc;
  if (!loc || typeof loc !== "object") {
    return undefined;
  }

  const start = (loc as { start?: unknown }).start;
  const end = (loc as { end?: unknown }).end;
  if (!start || !end || typeof start !== "object" || typeof end !== "object") {
    return undefined;
  }

  const startLine = (start as { line?: unknown }).line;
  const endLine = (end as { line?: unknown }).line;
  if (typeof startLine !== "number" || typeof endLine !== "number") {
    return undefined;
  }

  return {
    start: { line: startLine },
    end: { line: endLine }
  };
}

export function getFunctionName(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "changed function";
  }

  const candidate = node as { id?: { name?: unknown }; key?: { name?: unknown } };
  if (typeof candidate.id?.name === "string") {
    return candidate.id.name;
  }

  if (typeof candidate.key?.name === "string") {
    return candidate.key.name;
  }

  return "changed function";
}
