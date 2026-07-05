import type {
  ChangedLine,
  DesignBoundaryRule,
  DesignMatcher,
  FileChange,
  Finding
} from "@submuxhq/codedecay-core";
import { classifyPath, isSourcePath, isTestPath } from "../classifiers/paths";
import { listRepoFiles } from "../files/repo";
import { resolveLocalImportSpecifier } from "../imports/graph";
import { formatOwnershipEvidence } from "./codeowners";
import { appendBoundaryRuleEvidence } from "./descriptions";
import { matchesMatcher } from "./matchers";
import type { CodeownersIndex, ContractFileContext, ImportBoundaryContext } from "./types";

export function checkImportBoundaryRule(
  rule: DesignBoundaryRule,
  fromFiles: ContractFileContext[],
  rootDir: string,
  codeowners: CodeownersIndex
): Finding[] {
  if (!rule.disallow && !rule.allow) {
    return [];
  }

  return collectIntroducedLocalImports(rootDir, fromFiles).flatMap((dependency) => {
    const matchesDisallow = rule.disallow ? matchesImportTarget(rule.disallow, dependency) : false;
    const matchesAllow = rule.allow ? matchesImportTarget(rule.allow, dependency) : false;

    if (rule.disallow && matchesDisallow && !matchesAllow) {
      return [{
        ruleId: "contract-import-boundary-violation",
        title: "Design contract import boundary violated",
        description: importBoundaryDescription(rule, dependency, codeowners, "disallowed"),
        severity: rule.severity ?? "high",
        category: "scope",
        file: dependency.importer.change.path,
        line: dependency.line
      }];
    }

    if (!rule.disallow && rule.allow && !matchesAllow) {
      return [{
        ruleId: "contract-import-boundary-violation",
        title: "Design contract import boundary violated",
        description: importBoundaryDescription(rule, dependency, codeowners, "outside-allowlist"),
        severity: rule.severity ?? "medium",
        category: "scope",
        file: dependency.importer.change.path,
        line: dependency.line
      }];
    }

    return [];
  });
}

function matchesImportTarget(matcher: DesignMatcher, dependency: ImportBoundaryContext): boolean {
  return matchesMatcher(matcher, {
    change: {
      path: dependency.targetPath,
      status: "modified",
      additions: 0,
      deletions: 0,
      addedLines: []
    },
    areaKinds: dependency.targetAreaKinds,
    content: ""
  });
}

function collectIntroducedLocalImports(rootDir: string, files: ContractFileContext[]): ImportBoundaryContext[] {
  const repoSourceSet = createRepoSourceSet(rootDir);
  const dependencies: ImportBoundaryContext[] = [];

  for (const file of files) {
    if (!isSourcePath(file.change.path) || isTestPath(file.change.path)) {
      continue;
    }

    for (const addedImport of collectAddedImportSpecifiers(file.change)) {
      if (!addedImport.specifier.startsWith(".")) {
        continue;
      }

      const targetPath = resolveLocalImportSpecifier(file.change.path, addedImport.specifier, repoSourceSet);
      if (!targetPath) {
        continue;
      }

      const targetArea = classifyPath(targetPath);
      dependencies.push({
        importer: file,
        specifier: addedImport.specifier,
        targetPath,
        targetAreaKinds: targetArea ? new Set([targetArea.kind]) : new Set(),
        line: addedImport.line
      });
    }
  }

  return dependencies.sort((left, right) =>
    left.importer.change.path.localeCompare(right.importer.change.path) ||
    left.line - right.line ||
    left.targetPath.localeCompare(right.targetPath)
  );
}

function createRepoSourceSet(rootDir: string): Set<string> {
  return new Set(
    listRepoFiles(rootDir)
      .map((path) => normalizeRepoPath(path))
      .filter((path) => isSourcePath(path) && !isTestPath(path))
  );
}

function collectAddedImportSpecifiers(change: FileChange): Array<{ specifier: string; line: number }> {
  const imports: Array<{ specifier: string; line: number }> = [];

  for (const addedLine of change.addedLines) {
    for (const specifier of importSpecifiersFromLine(addedLine)) {
      imports.push({
        specifier,
        line: addedLine.line
      });
    }
  }

  return imports;
}

function importSpecifiersFromLine(line: ChangedLine): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /^\s*import\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of line.content.matchAll(pattern)) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers].sort((left, right) => left.localeCompare(right));
}

function importBoundaryDescription(
  rule: DesignBoundaryRule,
  dependency: ImportBoundaryContext,
  codeowners: CodeownersIndex,
  violationKind: "disallowed" | "outside-allowlist"
): string {
  const verb = violationKind === "disallowed" ? "imports disallowed target" : "imports outside allowed boundary";
  const defaultMessage =
    `${dependency.importer.change.path} ${verb} ${dependency.targetPath} via "${dependency.specifier}" under rule "${rule.id}".`;
  const parts = [
    rule.message ?? defaultMessage,
    `Changed file: ${dependency.importer.change.path}.`,
    `Imported target: ${dependency.targetPath}.`,
    `Import specifier: "${dependency.specifier}".`
  ];
  const ownership = formatOwnershipEvidence(codeowners, dependency.importer.change.path, dependency.targetPath);
  if (ownership) {
    parts.push(ownership);
  }

  return appendBoundaryRuleEvidence(rule, parts).join(" ");
}

function normalizeRepoPath(path: string): string {
  return path.replaceAll("\\", "/");
}
