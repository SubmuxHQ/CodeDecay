import { parse } from "@babel/parser";
import { getNodeType, type AstNode } from "../../ast/traverse";
import { resolveLocalImportSpecifier } from "../../imports/graph";
import type { SourceProfile } from "../source-profiles";
import { referencesSourceProfile } from "../source-profiles";

const FUNCTION_BOUNDARIES = new Set([
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "ClassMethod",
  "ClassPrivateMethod",
  "FunctionDeclaration",
  "FunctionExpression",
  "ObjectMethod"
]);

export function findTopLevelChangedSourceCallLine(
  testPath: string,
  content: string,
  sourceProfiles: SourceProfile[]
): number | undefined {
  if (sourceProfiles.length === 0) {
    return undefined;
  }

  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });
    const statements = readNodeArray(readNode(ast)?.program, "body");
    const importedBindings = collectChangedSourceBindings(testPath, statements, sourceProfiles);

    for (const statement of statements) {
      const line = findImportedCallLine(statement, importedBindings);
      if (line !== undefined) {
        return line;
      }
    }
  } catch {
    // Invalid or unsupported syntax should not create a weak-test finding.
  }

  return undefined;
}

function collectChangedSourceBindings(testPath: string, statements: AstNode[], sourceProfiles: SourceProfile[]): Set<string> {
  const bindings = new Set<string>();

  for (const statement of statements) {
    if (
      getNodeType(statement) === "ImportDeclaration" &&
      referencesChangedSource(testPath, readStringValue(statement.source), sourceProfiles)
    ) {
      for (const specifier of readNodeArray(statement, "specifiers")) {
        addIdentifierBinding(bindings, specifier.local);
      }
      continue;
    }

    if (getNodeType(statement) !== "VariableDeclaration") {
      continue;
    }

    for (const declaration of readNodeArray(statement, "declarations")) {
      if (referencesChangedSource(testPath, readRequiredSource(declaration.init), sourceProfiles)) {
        addPatternBindings(bindings, declaration.id);
      }
    }
  }

  return bindings;
}

function findImportedCallLine(node: unknown, importedBindings: Set<string>): number | undefined {
  const record = readNode(node);
  if (!record) {
    return undefined;
  }

  const type = getNodeType(record);
  if (type && FUNCTION_BOUNDARIES.has(type)) {
    return undefined;
  }

  if (
    (type === "CallExpression" || type === "OptionalCallExpression" || type === "NewExpression") &&
    referencesImportedBinding(record.callee, importedBindings)
  ) {
    return readStartLine(record) ?? 1;
  }

  for (const [key, value] of Object.entries(record)) {
    if (isMetadataKey(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const line = findImportedCallLine(item, importedBindings);
        if (line !== undefined) {
          return line;
        }
      }
      continue;
    }

    const line = findImportedCallLine(value, importedBindings);
    if (line !== undefined) {
      return line;
    }
  }

  return undefined;
}

function referencesImportedBinding(callee: unknown, importedBindings: Set<string>): boolean {
  let current = readNode(callee);

  while (current) {
    const type = getNodeType(current);
    if (type === "Identifier") {
      const name = readName(current);
      return name !== undefined && importedBindings.has(name);
    }

    if (type === "MemberExpression" || type === "OptionalMemberExpression") {
      current = readNode(current.object);
      continue;
    }

    if (
      type === "ChainExpression" ||
      type === "ParenthesizedExpression" ||
      type === "TSAsExpression" ||
      type === "TSNonNullExpression" ||
      type === "TSTypeAssertion"
    ) {
      current = readNode(current.expression);
      continue;
    }

    return false;
  }

  return false;
}

function readRequiredSource(value: unknown): string | undefined {
  const node = readNode(value);
  if (!node) {
    return undefined;
  }

  if (getNodeType(node) === "CallExpression" && readName(node.callee) === "require") {
    return readStringValue(readUnknownArray(node.arguments)[0]);
  }

  if (getNodeType(node) === "MemberExpression" || getNodeType(node) === "OptionalMemberExpression") {
    return readRequiredSource(node.object);
  }

  return undefined;
}

function addPatternBindings(bindings: Set<string>, pattern: unknown): void {
  const node = readNode(pattern);
  if (!node) {
    return;
  }

  if (getNodeType(node) === "Identifier") {
    addIdentifierBinding(bindings, node);
    return;
  }

  if (getNodeType(node) === "ObjectPattern") {
    for (const property of readNodeArray(node, "properties")) {
      addPatternBindings(bindings, property.value ?? property.argument);
    }
  }
}

function addIdentifierBinding(bindings: Set<string>, value: unknown): void {
  const name = readName(value);
  if (name) {
    bindings.add(name);
  }
}

function referencesChangedSource(testPath: string, source: string | undefined, sourceProfiles: SourceProfile[]): boolean {
  if (!source) {
    return false;
  }

  if (source.startsWith(".")) {
    return resolveLocalImportSpecifier(testPath, source, new Set(sourceProfiles.map((profile) => profile.path))) !== undefined;
  }

  return sourceProfiles.some((profile) => referencesSourceProfile(source, profile));
}

function readNode(value: unknown): AstNode | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as AstNode) : undefined;
}

function readNodeArray(value: unknown, key: string): AstNode[] {
  const record = readNode(value);
  if (!record) {
    return [];
  }

  return readUnknownArray(record[key]).flatMap((entry) => {
    const node = readNode(entry);
    return node ? [node] : [];
  });
}

function readUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readName(value: unknown): string | undefined {
  const candidate = readNode(value);
  return typeof candidate?.name === "string" ? candidate.name : undefined;
}

function readStringValue(value: unknown): string | undefined {
  const candidate = readNode(value);
  return typeof candidate?.value === "string" ? candidate.value : undefined;
}

function readStartLine(value: unknown): number | undefined {
  const loc = readNode(readNode(value)?.loc);
  const start = readNode(loc?.start);
  return typeof start?.line === "number" ? start.line : undefined;
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
