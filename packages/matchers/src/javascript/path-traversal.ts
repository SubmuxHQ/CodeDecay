import {
  identifierName,
  isAstNode,
  nodeLine,
  nodeType,
  parseJavaScript,
  sourceLine,
  type AstNode,
  type ParseQuality
} from "./ast";
import type { JavaScriptSecurityMatch } from "./types";
import { hasUserInputMarker, maskStringLiterals, stripComments } from "../utils";

const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
const FS_SINKS = new Set([
  "readFile",
  "readFileSync",
  "writeFile",
  "writeFileSync",
  "createReadStream",
  "createWriteStream"
]);
const EXPLICIT_INPUT_NAMES = new Set([
  "body",
  "headers",
  "params",
  "query",
  "req",
  "request",
  "searchparams"
]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

interface FsBindings {
  functions: Set<string>;
  receivers: Set<string>;
}

interface AnalysisScope {
  root: AstNode;
  routeHandler: boolean;
  parent?: AnalysisScope | undefined;
}

export function findPathTraversalMatches(content: string): JavaScriptSecurityMatch[] {
  const parsed = parseJavaScript(content);
  if (!parsed.ast) {
    return findHeuristicMatches(content, "unparsed");
  }

  const scopes = collectScopes(parsed.ast);
  const programScope = scopes.find((scope) => nodeType(scope.root) === "Program");
  const moduleBindings = collectFsBindings(programScope?.root ?? parsed.ast);
  const matches = new Map<string, JavaScriptSecurityMatch>();
  for (const scope of scopes) {
    const bindings = bindingsForScope(scope, moduleBindings);
    for (const match of analyzeScope(scope, bindings, content, parsed.quality)) {
      matches.set(`${match.line}:${match.text}`, match);
    }
  }
  const matchedLines = new Set([...matches.values()].map((match) => match.line));
  for (const match of findHeuristicMatches(content, "unbound")) {
    if (!matchedLines.has(match.line)) {
      matches.set(`${match.line}:${match.text}`, match);
    }
  }
  return [...matches.values()].sort((left, right) => left.line - right.line);
}

function collectFsBindings(ast: AstNode): FsBindings {
  // Require a real Node fs binding so lookalike helpers such as writeFiles are not sinks.
  const bindings: FsBindings = {
    functions: new Set<string>(),
    receivers: new Set<string>()
  };

  for (const node of nodesWithinScope(ast)) {
    if (nodeType(node) === "ImportDeclaration" && isFsModule(asNode(node.source))) {
      collectImportBindings(node, bindings);
      continue;
    }

    if (nodeType(node) === "VariableDeclarator") {
      collectRequireBindings(node, bindings);
    }
  }

  return bindings;
}

function collectImportBindings(node: AstNode, bindings: FsBindings): void {
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  const moduleName = stringValue(asNode(node.source));
  const promisesModule = moduleName?.endsWith("/promises") === true;

  for (const value of specifiers) {
    const specifier = asNode(value);
    const local = identifierName(asNode(specifier?.local));
    if (!specifier || !local) {
      continue;
    }

    const type = nodeType(specifier);
    if (type === "ImportNamespaceSpecifier" || type === "ImportDefaultSpecifier") {
      bindings.receivers.add(local);
      continue;
    }

    if (type !== "ImportSpecifier") {
      continue;
    }

    const imported = identifierName(asNode(specifier.imported));
    if (imported && FS_SINKS.has(imported)) {
      bindings.functions.add(local);
    } else if (imported === "promises" || promisesModule) {
      bindings.receivers.add(local);
    }
  }
}

function collectRequireBindings(node: AstNode, bindings: FsBindings): void {
  const id = asNode(node.id);
  const init = asNode(node.init);
  if (!id || !init) {
    return;
  }

  if (isFsRequireCall(init)) {
    if (nodeType(id) === "Identifier") {
      const receiver = identifierName(id);
      if (receiver) {
        bindings.receivers.add(receiver);
      }
    } else if (nodeType(id) === "ObjectPattern") {
      collectObjectPatternBindings(id, bindings);
    }
    return;
  }

  if (nodeType(init) !== "MemberExpression" && nodeType(init) !== "OptionalMemberExpression") {
    return;
  }

  const object = asNode(init.object);
  const property = memberPropertyName(init);
  const local = identifierName(id);
  if (!local || !property || !isFsRequireCall(object)) {
    return;
  }

  if (FS_SINKS.has(property)) {
    bindings.functions.add(local);
  } else if (property === "promises") {
    bindings.receivers.add(local);
  }
}

function collectObjectPatternBindings(pattern: AstNode, bindings: FsBindings): void {
  const properties = Array.isArray(pattern.properties) ? pattern.properties : [];
  for (const value of properties) {
    const property = asNode(value);
    if (nodeType(property) !== "ObjectProperty") {
      continue;
    }

    const imported = identifierName(asNode(property?.key));
    const local = identifierName(asNode(property?.value));
    if (imported && local && FS_SINKS.has(imported)) {
      bindings.functions.add(local);
    }
  }
}

function collectScopes(ast: AstNode): AnalysisScope[] {
  const scopes: AnalysisScope[] = [];
  function visit(
    value: unknown,
    currentScope: AnalysisScope | undefined,
    parentNode: AstNode | undefined
  ): void {
    if (!isAstNode(value)) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, currentScope, parentNode);
      }
      return;
    }

    let childScope = currentScope;
    if (nodeType(value) === "Program") {
      childScope = { root: value, routeHandler: false };
      scopes.push(childScope);
    } else if (isFunctionNode(value)) {
      childScope = {
        root: value,
        routeHandler: isRouteHandler(value, parentNode),
        parent: currentScope
      };
      scopes.push(childScope);
    }

    for (const [key, child] of Object.entries(value)) {
      if (SCOPE_IGNORED_KEYS.has(key)) {
        continue;
      }
      visit(child, childScope, value);
    }
  }

  visit(ast, undefined, undefined);
  return scopes;
}

function bindingsForScope(scope: AnalysisScope, moduleBindings: FsBindings): FsBindings {
  const bindings = cloneBindings(moduleBindings);
  const lineage: AnalysisScope[] = [];
  let current: AnalysisScope | undefined = scope;
  while (current && nodeType(current.root) !== "Program") {
    lineage.unshift(current);
    current = current.parent;
  }

  for (const lexicalScope of lineage) {
    for (const name of declaredNames(lexicalScope.root)) {
      bindings.functions.delete(name);
      bindings.receivers.delete(name);
    }
    mergeBindings(bindings, collectFsBindings(lexicalScope.root));
  }
  return bindings;
}

function declaredNames(root: AstNode): Set<string> {
  const names = new Set<string>();
  const params = Array.isArray(root.params) ? root.params : [];
  for (const parameter of params) {
    for (const name of targetIdentifiers(asNode(parameter))) {
      names.add(name);
    }
  }

  for (const node of nodesWithinScope(root)) {
    const type = nodeType(node);
    if (type === "VariableDeclarator") {
      for (const name of targetIdentifiers(asNode(node.id))) {
        names.add(name);
      }
    } else if (
      type === "FunctionDeclaration" ||
      (node === root && type === "FunctionExpression") ||
      type === "ClassDeclaration"
    ) {
      const name = identifierName(asNode(node.id));
      if (name) {
        names.add(name);
      }
    } else if (type === "CatchClause") {
      for (const name of targetIdentifiers(asNode(node.param))) {
        names.add(name);
      }
    }
  }
  return names;
}

function cloneBindings(bindings: FsBindings): FsBindings {
  return {
    functions: new Set(bindings.functions),
    receivers: new Set(bindings.receivers)
  };
}

function mergeBindings(target: FsBindings, source: FsBindings): void {
  for (const name of source.functions) {
    target.functions.add(name);
  }
  for (const name of source.receivers) {
    target.receivers.add(name);
  }
}

function analyzeScope(
  scope: AnalysisScope,
  bindings: FsBindings,
  content: string,
  quality: ParseQuality
): JavaScriptSecurityMatch[] {
  // Keep taint local to each function so unrelated request parsing cannot taint helper parameters.
  const nodes = nodesWithinScope(scope.root).sort(
    (left, right) => nodeStart(left) - nodeStart(right)
  );
  const tainted = initialTaintedIdentifiers(scope);

  for (const node of nodes) {
    if (nodeType(node) === "VariableDeclarator" && expressionIsTainted(asNode(node.init), tainted)) {
      addTargetIdentifiers(asNode(node.id), tainted);
    } else if (
      nodeType(node) === "AssignmentExpression" &&
      expressionIsTainted(asNode(node.right), tainted)
    ) {
      addTargetIdentifiers(asNode(node.left), tainted);
    }
  }

  const matches: JavaScriptSecurityMatch[] = [];
  for (const node of nodes) {
    if (nodeType(node) !== "CallExpression" && nodeType(node) !== "OptionalCallExpression") {
      continue;
    }
    if (!isFileSystemSink(asNode(node.callee), bindings)) {
      continue;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];
    const pathArgument = asNode(args[0]);
    if (!pathArgument || !expressionIsTainted(pathArgument, tainted)) {
      continue;
    }

    const line = nodeLine(node);
    if (!line) {
      continue;
    }
    matches.push(createParsedMatch(content, line, quality));
  }

  return matches;
}

function nodesWithinScope(root: AstNode): AstNode[] {
  const nodes: AstNode[] = [];

  function visit(value: unknown, isRoot: boolean): void {
    if (!isAstNode(value)) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, false);
      }
      return;
    }
    if (!isRoot && isFunctionNode(value)) {
      nodes.push(value);
      return;
    }

    nodes.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (SCOPE_IGNORED_KEYS.has(key)) {
        continue;
      }
      visit(child, false);
    }
  }

  visit(root, true);
  return nodes;
}

function initialTaintedIdentifiers(scope: AnalysisScope): Set<string> {
  const tainted = new Set<string>();
  if (nodeType(scope.root) === "Program") {
    return tainted;
  }

  const params = Array.isArray(scope.root.params) ? scope.root.params : [];
  for (const [index, value] of params.entries()) {
    const names = targetIdentifiers(asNode(value));
    for (const name of names) {
      if (
        EXPLICIT_INPUT_NAMES.has(name.toLowerCase()) ||
        (scope.routeHandler && index === 0)
      ) {
        tainted.add(name);
      }
    }
  }
  return tainted;
}

function expressionIsTainted(
  node: AstNode | undefined,
  tainted: Set<string>
): boolean {
  if (!node) {
    return false;
  }

  if (nodeType(node) === "Identifier") {
    const name = identifierName(node);
    return name ? tainted.has(name) : false;
  }

  if (isProcessArgv(node)) {
    return true;
  }

  if (nodeType(node) === "MemberExpression" || nodeType(node) === "OptionalMemberExpression") {
    if (expressionIsTainted(asNode(node.object), tainted)) {
      return true;
    }
    return node.computed === true && expressionIsTainted(asNode(node.property), tainted);
  }

  if (nodeType(node) === "ObjectProperty") {
    return expressionIsTainted(asNode(node.value), tainted);
  }

  for (const [key, value] of Object.entries(node)) {
    if (EXPRESSION_IGNORED_KEYS.has(key)) {
      continue;
    }
    if (expressionValueIsTainted(value, tainted)) {
      return true;
    }
  }
  return false;
}

function expressionValueIsTainted(value: unknown, tainted: Set<string>): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => expressionValueIsTainted(item, tainted));
  }
  return isAstNode(value) && expressionIsTainted(value, tainted);
}

function isFileSystemSink(callee: AstNode | undefined, bindings: FsBindings): boolean {
  if (!callee) {
    return false;
  }

  if (nodeType(callee) === "Identifier") {
    const name = identifierName(callee);
    return name ? bindings.functions.has(name) : false;
  }

  if (nodeType(callee) !== "MemberExpression" && nodeType(callee) !== "OptionalMemberExpression") {
    return false;
  }

  const property = memberPropertyName(callee);
  if (!property || !FS_SINKS.has(property)) {
    return false;
  }

  const root = memberRootIdentifier(asNode(callee.object));
  return root ? bindings.receivers.has(root) : false;
}

function memberRootIdentifier(node: AstNode | undefined): string | undefined {
  let current = node;
  while (
    nodeType(current) === "MemberExpression" ||
    nodeType(current) === "OptionalMemberExpression"
  ) {
    current = asNode(current?.object);
  }
  return identifierName(current);
}

function memberPropertyName(node: AstNode): string | undefined {
  const property = asNode(node.property);
  if (node.computed === true) {
    return stringValue(property);
  }
  return identifierName(property);
}

function isProcessArgv(node: AstNode): boolean {
  if (nodeType(node) !== "MemberExpression" && nodeType(node) !== "OptionalMemberExpression") {
    return false;
  }
  return (
    identifierName(asNode(node.object)) === "process" &&
    memberPropertyName(node) === "argv"
  );
}

function isRouteHandler(node: AstNode, parent: AstNode | undefined): boolean {
  const name = functionName(node, parent);
  if (name && HTTP_METHODS.has(name.toUpperCase())) {
    return true;
  }

  if (
    (nodeType(parent) === "CallExpression" || nodeType(parent) === "OptionalCallExpression") &&
    Array.isArray(parent?.arguments) &&
    parent.arguments.includes(node)
  ) {
    const method = memberPropertyName(asNode(parent.callee) ?? {});
    return method ? HTTP_METHODS.has(method.toUpperCase()) : false;
  }

  return false;
}

function functionName(node: AstNode, parent: AstNode | undefined): string | undefined {
  const direct = identifierName(asNode(node.id)) ?? identifierName(asNode(node.key));
  if (direct) {
    return direct;
  }
  if (nodeType(parent) === "VariableDeclarator") {
    return identifierName(asNode(parent?.id));
  }
  return undefined;
}

function isFunctionNode(node: AstNode): boolean {
  return [
    "ArrowFunctionExpression",
    "ClassMethod",
    "FunctionDeclaration",
    "FunctionExpression",
    "ObjectMethod"
  ].includes(nodeType(node) ?? "");
}

function addTargetIdentifiers(node: AstNode | undefined, tainted: Set<string>): void {
  for (const name of targetIdentifiers(node)) {
    tainted.add(name);
  }
}

function targetIdentifiers(node: AstNode | undefined): string[] {
  const direct = identifierName(node);
  if (direct) {
    return [direct];
  }
  if (!node) {
    return [];
  }

  const type = nodeType(node);
  if (type === "AssignmentPattern") {
    return targetIdentifiers(asNode(node.left));
  }
  if (type === "RestElement") {
    return targetIdentifiers(asNode(node.argument));
  }
  if (type === "ObjectPattern") {
    const properties = Array.isArray(node.properties) ? node.properties : [];
    return properties.flatMap((property) => {
      const typed = asNode(property);
      return nodeType(typed) === "ObjectProperty"
        ? targetIdentifiers(asNode(typed?.value))
        : targetIdentifiers(typed);
    });
  }
  if (type === "ArrayPattern") {
    const elements = Array.isArray(node.elements) ? node.elements : [];
    return elements.flatMap((element) => targetIdentifiers(asNode(element)));
  }
  if (type === "MemberExpression" || type === "OptionalMemberExpression") {
    return [];
  }
  return [];
}

function createParsedMatch(
  content: string,
  line: number,
  quality: ParseQuality
): JavaScriptSecurityMatch {
  const direct = quality === "parsed";
  return {
    line,
    text: sourceLine(content, line),
    severity: direct ? "high" : "medium",
    confidence: direct ? "direct" : "heuristic",
    evidence: direct
      ? "AST-confirmed Node file-system sink receives request-controlled data directly or through a local assignment."
      : "Parser recovery found a Node file-system sink receiving request-controlled data; confirm the malformed source before treating it as direct evidence."
  };
}

function findHeuristicMatches(
  content: string,
  reason: "unbound" | "unparsed"
): JavaScriptSecurityMatch[] {
  const originalLines = content.split(/\n/);
  const codeLines = stripComments(content).split(/\n/);
  const sinkPattern =
    /(?:\b(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream)\s*\(|\b[$A-Z_a-z][$\w]*\.(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream)\s*\()/i;

  return codeLines.flatMap((line, index) => {
    const codeLine = maskStringLiterals(line);
    if (!sinkPattern.test(codeLine) || !hasUserInputMarker(codeLine)) {
      return [];
    }

    return [
      {
        line: index + 1,
        text: originalLines[index]?.trim() ?? "",
        severity: "medium" as const,
        confidence: "heuristic" as const,
        evidence: reason === "unparsed"
          ? "Heuristic parse fallback found a file-system sink and explicit request input on the same line; parse the complete source to confirm direct evidence."
          : "Heuristic matching found a file-system-like call with explicit request input, but no Node fs binding proves the sink is direct."
      }
    ];
  });
}

function isFsModule(node: AstNode | undefined): boolean {
  const value = stringValue(node);
  return value ? FS_MODULES.has(value) : false;
}

function isFsRequireCall(node: AstNode | undefined): boolean {
  if (nodeType(node) !== "CallExpression") {
    return false;
  }
  if (identifierName(asNode(node?.callee)) !== "require") {
    return false;
  }
  const args = Array.isArray(node?.arguments) ? node.arguments : [];
  const moduleName = stringValue(asNode(args[0]));
  return moduleName ? FS_MODULES.has(moduleName) : false;
}

function stringValue(node: AstNode | undefined): string | undefined {
  return nodeType(node) === "StringLiteral" && typeof node?.value === "string"
    ? node.value
    : undefined;
}

function nodeStart(node: AstNode): number {
  return typeof node.start === "number" ? node.start : Number.MAX_SAFE_INTEGER;
}

function asNode(value: unknown): AstNode | undefined {
  return isAstNode(value) && !Array.isArray(value) ? value : undefined;
}

const SCOPE_IGNORED_KEYS = new Set([
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

const EXPRESSION_IGNORED_KEYS = new Set([
  ...SCOPE_IGNORED_KEYS,
  "type",
  "key",
  "property"
]);
