import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DesignContract,
  DesignMatcher,
  FileChange,
  Finding,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";

export interface DesignContractCheckInput {
  rootDir: string;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  contract?: DesignContract | undefined;
}

export interface DesignContractCheckResult {
  findings: Finding[];
}

interface FileContext {
  change: FileChange;
  areaKinds: Set<ImpactedArea["kind"]>;
  content: string;
}

export function checkDesignContract(input: DesignContractCheckInput): DesignContractCheckResult {
  if (!input.contract) {
    return { findings: [] };
  }

  const files = input.changedFiles
    .filter((change) => change.status !== "deleted")
    .map((change) => createFileContext(input.rootDir, change, input.impactedAreas));
  const findings: Finding[] = [];

  findings.push(...checkScopeFences(input.contract, files));
  findings.push(...checkBoundaryRules(input.contract, files));
  findings.push(...checkDependencyRules(input.contract, files));
  findings.push(...checkBannedApis(input.contract, files));
  findings.push(...checkPatternRules(input.contract, files));

  return { findings };
}

function checkScopeFences(contract: DesignContract, files: FileContext[]): Finding[] {
  const activeFenceId = contract.activeScopeFence;
  if (!activeFenceId) {
    return [];
  }

  const fence = contract.scopeFences?.find((candidate) => candidate.id === activeFenceId);
  if (!fence) {
    return [
      {
        ruleId: "contract-scope-fence-missing",
        title: "Configured scope fence is missing",
        description: `Design contract activeScopeFence "${activeFenceId}" does not match any scopeFences entry.`,
        severity: "high",
        category: "scope"
      }
    ];
  }

  const allowed: DesignMatcher = {
    files: fence.allowedFiles ?? fence.files,
    areas: fence.allowedAreas ?? fence.areas,
    productPaths: fence.productPaths
  };
  return files
    .filter((file) => !matchesMatcher(allowed, file))
    .map((file) => ({
      ruleId: "contract-scope-fence",
      title: "Change exceeds design contract scope fence",
      description: fence.message ?? `${file.change.path} is outside active scope fence "${fence.id}".`,
      severity: fence.severity ?? "high",
      category: "scope",
      file: file.change.path,
      line: firstChangedLine(file.change)
    }));
}

function checkBoundaryRules(contract: DesignContract, files: FileContext[]): Finding[] {
  return (contract.boundaryRules ?? []).flatMap((rule) => {
    const fromFiles = files.filter((file) => matchesMatcher(rule.from, file));
    if (fromFiles.length === 0) {
      return [];
    }

    if (rule.disallow) {
      const disallow = rule.disallow;
      return files
        .filter((file) => matchesMatcher(disallow, file))
        .map((file) => ({
          ruleId: "contract-boundary-violation",
          title: "Design contract boundary violated",
          description: rule.message ?? `${file.change.path} crosses disallowed boundary rule "${rule.id}".`,
          severity: rule.severity ?? "high",
          category: "scope",
          file: file.change.path,
          line: firstChangedLine(file.change)
        }));
    }

    if (rule.allow) {
      const allow = rule.allow;
      return files
        .filter((file) => !matchesMatcher(allow, file))
        .map((file) => ({
          ruleId: "contract-boundary-violation",
          title: "Design contract boundary violated",
          description: rule.message ?? `${file.change.path} is outside allowed boundary rule "${rule.id}".`,
          severity: rule.severity ?? "high",
          category: "scope",
          file: file.change.path,
          line: firstChangedLine(file.change)
        }));
    }

    return [];
  });
}

function checkDependencyRules(contract: DesignContract, files: FileContext[]): Finding[] {
  return (contract.dependencyRules ?? []).flatMap((rule) =>
    files.filter((file) => matchesMatcher(rule, file)).flatMap((file) => {
      const imports = collectImportSpecifiers(file.content);
      const findings: Finding[] = [];

      for (const specifier of imports) {
        if (rule.bannedImports?.some((pattern) => matchesImportPattern(specifier, pattern))) {
          findings.push({
            ruleId: "contract-banned-import",
            title: "Design contract banned import used",
            description: rule.message ?? `${file.change.path} imports banned dependency "${specifier}" under rule "${rule.id}".`,
            severity: rule.severity ?? "high",
            category: "scope",
            file: file.change.path,
            line: firstLineContaining(file.content, specifier) ?? firstChangedLine(file.change)
          });
          continue;
        }

        if (rule.allowedImports && !rule.allowedImports.some((pattern) => matchesImportPattern(specifier, pattern))) {
          findings.push({
            ruleId: "contract-import-allowlist",
            title: "Design contract import allowlist violated",
            description: rule.message ?? `${file.change.path} imports "${specifier}", which is outside allowlist rule "${rule.id}".`,
            severity: rule.severity ?? "medium",
            category: "scope",
            file: file.change.path,
            line: firstLineContaining(file.content, specifier) ?? firstChangedLine(file.change)
          });
        }
      }

      return findings;
    })
  );
}

function checkBannedApis(contract: DesignContract, files: FileContext[]): Finding[] {
  return (contract.bannedApis ?? []).flatMap((rule) =>
    files.filter((file) => matchesMatcher(rule, file)).flatMap((file) =>
      rule.apis.flatMap((api) => {
        const line = firstLineContaining(file.content, api);
        if (line === undefined) {
          return [];
        }

        return [{
          ruleId: "contract-banned-api",
          title: "Design contract banned API used",
          description: rule.message ?? `${file.change.path} uses banned API "${api}" under rule "${rule.id}".`,
          severity: rule.severity ?? "high",
          category: "scope",
          file: file.change.path,
          line
        }];
      })
    )
  );
}

function checkPatternRules(contract: DesignContract, files: FileContext[]): Finding[] {
  return (contract.patternRules ?? []).flatMap((rule) =>
    files.filter((file) => matchesMatcher(rule, file)).flatMap((file) => {
      const findings: Finding[] = [];
      for (const required of rule.required ?? []) {
        if (!file.content.includes(required)) {
          findings.push({
            ruleId: "contract-pattern-violation",
            title: "Design contract required pattern missing",
            description: rule.message ?? `${file.change.path} is missing required pattern "${required}" from rule "${rule.id}".`,
            severity: rule.severity ?? "low",
            category: "scope",
            file: file.change.path,
            line: firstChangedLine(file.change)
          });
        }
      }

      for (const forbidden of rule.forbidden ?? []) {
        const line = firstLineContaining(file.content, forbidden);
        if (line !== undefined) {
          findings.push({
            ruleId: "contract-pattern-violation",
            title: "Design contract forbidden pattern used",
            description: rule.message ?? `${file.change.path} uses forbidden pattern "${forbidden}" from rule "${rule.id}".`,
            severity: rule.severity ?? "low",
            category: "scope",
            file: file.change.path,
            line
          });
        }
      }

      return findings;
    })
  );
}

function createFileContext(rootDir: string, change: FileChange, impactedAreas: ImpactedArea[]): FileContext {
  return {
    change,
    areaKinds: new Set(impactedAreas.filter((area) => area.files.includes(change.path)).map((area) => area.kind)),
    content: readChangeContent(rootDir, change)
  };
}

function matchesMatcher(matcher: DesignMatcher, file: FileContext): boolean {
  const hasFileMatcher = Boolean(matcher.files?.length);
  const hasAreaMatcher = Boolean(matcher.areas?.length);

  if (!hasFileMatcher && !hasAreaMatcher) {
    return true;
  }

  return (
    (matcher.files?.some((pattern) => matchesPathPattern(file.change.path, pattern)) ?? false) ||
    (matcher.areas?.some((area) => file.areaKinds.has(area)) ?? false)
  );
}

function collectImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers].sort((left, right) => left.localeCompare(right));
}

function matchesPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

function matchesImportPattern(specifier: string, pattern: string): boolean {
  return matchesPathPattern(specifier, pattern);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readChangeContent(rootDir: string, change: FileChange): string {
  try {
    return readFileSync(join(rootDir, change.path), "utf8");
  } catch {
    return change.addedLines.map((line) => line.content).join("\n");
  }
}

function firstChangedLine(change: FileChange): number | undefined {
  return change.addedLines[0]?.line;
}

function firstLineContaining(content: string, needle: string): number | undefined {
  const lines = content.split(/\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  return index === -1 ? undefined : index + 1;
}
