import { parse } from "@babel/parser";
import type { FileChange } from "@submuxhq/codedecay-core";
import { getNodeType, walk } from "../ast/traverse";
import { firstLine } from "../findings/builders";

export interface FunctionMetric {
  file: string;
  line: number;
  name: string;
  lines: number;
  complexity: number;
}

export function analyzeFunctions(change: FileChange, content: string): FunctionMetric[] {
  const changedLines = new Set(change.addedLines.map((line) => line.line));

  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });

    const metrics: FunctionMetric[] = [];
    walk(ast, (node) => {
      const loc = readNodeLoc(node);
      if (!isFunctionNode(node) || !loc) {
        return;
      }

      const startLine = loc.start.line;
      const endLine = loc.end.line;
      const touchesChangedLine =
        changedLines.size === 0 ||
        [...changedLines].some((line) => line >= startLine && line <= endLine);

      if (!touchesChangedLine) {
        return;
      }

      metrics.push({
        file: change.path,
        line: startLine,
        name: getFunctionName(node),
        lines: endLine - startLine + 1,
        complexity: estimateComplexity(node)
      });
    });

    return metrics;
  } catch {
    return [
      {
        file: change.path,
        line: firstLine(change) ?? 1,
        name: "unparsed source",
        lines: 0,
        complexity: 12
      }
    ];
  }
}

function estimateComplexity(node: unknown): number {
  let complexity = 1;
  walk(node, (child) => {
    const type = getNodeType(child);
    if (
      type === "IfStatement" ||
      type === "ForStatement" ||
      type === "ForInStatement" ||
      type === "ForOfStatement" ||
      type === "WhileStatement" ||
      type === "DoWhileStatement" ||
      type === "SwitchCase" ||
      type === "CatchClause" ||
      type === "ConditionalExpression"
    ) {
      complexity += 1;
    }

    if (type === "LogicalExpression" && (child.operator === "&&" || child.operator === "||")) {
      complexity += 1;
    }
  });

  return complexity;
}

function isFunctionNode(node: unknown): boolean {
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

function readNodeLoc(node: unknown): { start: { line: number }; end: { line: number } } | undefined {
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

function getFunctionName(node: unknown): string {
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
