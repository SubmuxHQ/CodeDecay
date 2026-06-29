import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { parse } from "@babel/parser";
import { getNodeType, walk } from "../ast/traverse";
import { isSourcePath, isTestPath } from "../classifiers/paths";
import { listRepoFiles } from "../files/repo";

const SOURCE_EXTENSION_CANDIDATES = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];

export function buildReverseImportGraph(rootDir: string): Map<string, string[]> {
  const repoSourceFiles = listRepoFiles(rootDir)
    .map((file) => normalizePath(file))
    .filter((file) => isSourcePath(file) && !isTestPath(file));
  const repoSourceSet = new Set(repoSourceFiles);
  const importersBySource = new Map<string, Set<string>>();

  for (const file of repoSourceFiles) {
    const content = readRepoFile(rootDir, file);
    if (!content) {
      continue;
    }

    for (const specifier of extractLocalImportSpecifiers(content)) {
      const resolved = resolveLocalImportSpecifier(file, specifier, repoSourceSet);
      if (!resolved) {
        continue;
      }

      const importers = importersBySource.get(resolved) ?? new Set<string>();
      importers.add(file);
      importersBySource.set(resolved, importers);
    }
  }

  return new Map(
    [...importersBySource.entries()].map(([source, importers]) => [source, [...importers].sort((left, right) => left.localeCompare(right))])
  );
}

export function findReverseImportChains(sourcePath: string, reverseImportGraph: Map<string, string[]>): string[][] {
  const queue: string[][] = [[sourcePath]];
  const visited = new Set<string>([sourcePath]);
  const chains: string[][] = [];

  while (queue.length > 0 && chains.length < 24) {
    const chain = queue.shift();
    if (!chain) {
      continue;
    }

    const current = chain.at(-1);
    if (!current) {
      continue;
    }

    for (const importer of reverseImportGraph.get(current) ?? []) {
      if (chain.includes(importer) || chain.length >= 6) {
        continue;
      }

      const nextChain = [...chain, importer];
      chains.push(nextChain);

      if (!visited.has(importer)) {
        visited.add(importer);
        queue.push(nextChain);
      }
    }
  }

  return chains;
}

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

export function resolveLocalImportSpecifier(
  importerPath: string,
  specifier: string,
  repoSourceSet: Set<string>
): string | undefined {
  const relativeTarget = normalizePath(join(dirname(importerPath), specifier));
  const candidates = new Set<string>();
  candidates.add(relativeTarget);

  if (!extname(relativeTarget)) {
    for (const extension of SOURCE_EXTENSION_CANDIDATES) {
      candidates.add(`${relativeTarget}${extension}`);
      candidates.add(`${relativeTarget}/index${extension}`);
    }
  }

  for (const candidate of candidates) {
    if (repoSourceSet.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readRepoFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
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
