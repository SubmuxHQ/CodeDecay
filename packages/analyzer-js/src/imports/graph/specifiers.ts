import { parse } from "@babel/parser";
import { getNodeType, walk } from "../../ast/traverse";

export function extractLocalImportSpecifiers(content: string): string[] {
  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });
    const specifiers = new Set<string>();

    walk(ast, (node) => {
      const type = getNodeType(node);
      const sourceValue = readStringValue(node.source);
      if (
        (type === "ImportDeclaration" || type === "ExportNamedDeclaration" || type === "ExportAllDeclaration") &&
        sourceValue?.startsWith(".")
      ) {
        specifiers.add(sourceValue);
      }

      const firstArgumentValue = Array.isArray(node.arguments) ? readStringValue(node.arguments[0]) : undefined;
      if (
        type === "CallExpression" &&
        getNodeType(node.callee) === "Identifier" &&
        readName(node.callee) === "require" &&
        firstArgumentValue?.startsWith(".")
      ) {
        specifiers.add(firstArgumentValue);
      }

      if (type === "CallExpression" && getNodeType(node.callee) === "Import" && firstArgumentValue?.startsWith(".")) {
        specifiers.add(firstArgumentValue);
      }

      if (type === "ImportExpression" && sourceValue?.startsWith(".")) {
        specifiers.add(sourceValue);
      }
    });

    return [...specifiers];
  } catch {
    return [];
  }
}

function readStringValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { value?: unknown };
  return typeof candidate.value === "string" ? candidate.value : undefined;
}

function readName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { name?: unknown };
  return typeof candidate.name === "string" ? candidate.name : undefined;
}
