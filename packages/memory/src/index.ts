import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
  FileChange,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import {
  countMemoryEntries,
  importCodeDecayMemory,
  sortArchitecture,
  sortCommands,
  sortFlows,
  sortInvariants,
  sortRegressions
} from "./import-memory";
import {
  cloneMemory,
  isEmptyMemory,
  isPlainObject,
  normalizeArray,
  normalizeObject,
  normalizeProductPath,
  optionalString,
  optionalStringArray,
  requiredString
} from "./schema";
import { DEFAULT_CODEDECAY_MEMORY } from "./types";
import type {
  CodeDecayMemory,
  MemoryContextInput,
  MemoryLearnResult,
  MemoryMatcher,
} from "./types";

export { importCodeDecayMemory } from "./import-memory";
export {
  createLocalMemoryProvider,
  createMemoryProviderRegistry,
  loadCodeDecayMemory,
  loadCodeDecayMemoryFromProvider,
  MemoryProviderRegistry
} from "./providers";
export { DEFAULT_CODEDECAY_MEMORY } from "./types";
export type {
  CodeDecayMemory,
  LoadedCodeDecayMemory,
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryContextInput,
  MemoryFlow,
  MemoryImportCounts,
  MemoryImportResult,
  MemoryInvariant,
  MemoryLearnResult,
  MemoryMatcher,
  MemoryProvider,
  MemoryProviderKind,
  MemoryProviderLoadOptions,
  MemoryRegression
} from "./types";

export function learnCodeDecayMemory(
  baseMemory: CodeDecayMemory,
  learnedValue: unknown,
  sourceName: string = "memory learn"
): MemoryLearnResult {
  const learnedMemory = normalizeLearnedMemory(learnedValue, sourceName);
  const result = importCodeDecayMemory(baseMemory, learnedMemory, sourceName);

  return {
    ...result,
    learned: countMemoryEntries(learnedMemory)
  };
}

export function writeCodeDecayMemory(rootDir: string, memory: CodeDecayMemory): string {
  const directory = join(rootDir, ".codedecay");
  const sourcePath = join(directory, "memory.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return sourcePath;
}

export function applyMemoryContext(input: MemoryContextInput): AnalyzerResult {
  if (isEmptyMemory(input.memory)) {
    return input.analyzerResult;
  }

  const findings = [...input.analyzerResult.findings];
  const recommendedTests = [...input.analyzerResult.recommendedTests];

  for (const invariant of input.memory.invariants) {
    const match = firstMatchingFile(invariant, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-invariant-impacted",
      title: "Project invariant may be impacted",
      description: `Memory invariant "${invariant.name}" applies to this change. ${invariant.description}`,
      severity: invariant.severity ?? "medium",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
    recommendedTests.push(`Verify invariant: ${invariant.name}`);
  }

  for (const regression of input.memory.regressions) {
    const match = firstMatchingFile(regression, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-past-regression-area",
      title: "Past regression area changed",
      description: `Past regression "${regression.title}" may be relevant. ${regression.description}`,
      severity: regression.severity ?? "high",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
    recommendedTests.push(regression.check ? `Regression check: ${regression.check}` : `Regression check: ${regression.title}`);
  }

  for (const flow of input.memory.flows) {
    if (!matchesMemoryEntry(flow, input.changedFiles, input.impactedAreas)) {
      continue;
    }

    recommendedTests.push(`Verify flow: ${flow.name}`);
    recommendedTests.push(...(flow.checks ?? []).map((check) => `Flow check (${flow.name}): ${check}`));
  }

  for (const command of input.memory.commands) {
    if (!matchesMemoryEntry(command, input.changedFiles, input.impactedAreas)) {
      continue;
    }

    recommendedTests.push(`Run project command: ${command.name} (${command.command})`);
  }

  for (const note of input.memory.architecture) {
    const match = firstMatchingFile(note, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-architecture-note",
      title: "Architecture note applies",
      description: `${note.title}: ${note.note}`,
      severity: "low",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
  }

  return {
    ...input.analyzerResult,
    findings,
    recommendedTests: dedupeStrings(recommendedTests)
  };
}

function normalizeLearnedMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  const object = normalizeObject(value, sourcePath, "root");
  const learned = cloneMemory(DEFAULT_CODEDECAY_MEMORY);

  for (const failure of normalizeArray(object.ciFailures, sourcePath, "ciFailures")) {
    appendLearnedCiFailure(learned, failure, sourcePath);
  }

  for (const pullRequest of normalizeArray(object.pullRequests, sourcePath, "pullRequests")) {
    appendLearnedPullRequest(learned, pullRequest, sourcePath);
  }

  for (const report of collectLearnedReports(object)) {
    appendLearnedCodeDecayReport(learned, report);
  }

  if (isCodeDecayReportLike(object)) {
    appendLearnedCodeDecayReport(learned, object);
  }

  for (const report of collectLearnedProductReports(object)) {
    appendLearnedProductReport(learned, report);
  }

  if (isProductTargetReportLike(object)) {
    appendLearnedProductReport(learned, object);
  }

  return {
    version: 1,
    flows: sortFlows(learned.flows),
    commands: sortCommands(learned.commands),
    invariants: sortInvariants(learned.invariants),
    architecture: sortArchitecture(learned.architecture),
    regressions: sortRegressions(learned.regressions)
  };
}

function appendLearnedCiFailure(memory: CodeDecayMemory, value: unknown, sourcePath: string): void {
  const object = normalizeObject(value, sourcePath, "ciFailures[]");
  const title =
    optionalString(object.title, sourcePath, "ciFailures[].title") ??
    optionalString(object.name, sourcePath, "ciFailures[].name") ??
    optionalString(object.job, sourcePath, "ciFailures[].job") ??
    optionalString(object.workflow, sourcePath, "ciFailures[].workflow") ??
    "CI failure";
  const description =
    optionalString(object.description, sourcePath, "ciFailures[].description") ??
    optionalString(object.summary, sourcePath, "ciFailures[].summary") ??
    optionalString(object.message, sourcePath, "ciFailures[].message") ??
    `Learned from CI failure: ${title}.`;
  const command =
    optionalString(object.command, sourcePath, "ciFailures[].command") ??
    optionalString(object.testCommand, sourcePath, "ciFailures[].testCommand");
  const matcher = inferMemoryMatcher(object, `${title}\n${description}`);
  const check = optionalString(object.check, sourcePath, "ciFailures[].check") ?? command ?? `Re-run failing CI path: ${title}`;

  memory.regressions.push({
    title,
    description,
    check,
    severity: "high",
    ...matcher
  });

  if (command) {
    memory.commands.push({
      name: `${title} check`,
      command,
      description,
      ...matcher
    });
  }
}

function appendLearnedPullRequest(memory: CodeDecayMemory, value: unknown, sourcePath: string): void {
  const object = normalizeObject(value, sourcePath, "pullRequests[]");
  const title = requiredString(object.title, sourcePath, "pullRequests[].title");
  const body =
    optionalString(object.body, sourcePath, "pullRequests[].body") ??
    optionalString(object.description, sourcePath, "pullRequests[].description") ??
    optionalString(object.summary, sourcePath, "pullRequests[].summary") ??
    "";
  const commits = optionalStringArray(object.commits, sourcePath, "pullRequests[].commits") ?? [];
  const checks = optionalStringArray(object.checks, sourcePath, "pullRequests[].checks") ?? [];
  const text = [title, body, ...commits].filter(Boolean).join("\n");
  const matcher = inferMemoryMatcher(object, text);
  const description = body || `Learned from merged PR: ${title}.`;
  const generatedCheck = checks[0] ?? inferCheckFromText(title, text);

  memory.architecture.push({
    title,
    note: description,
    ...matcher
  });

  if (checks.length > 0) {
    memory.flows.push({
      name: title,
      description,
      checks,
      ...matcher
    });
  }

  if (looksLikeRegressionLearning(text)) {
    memory.regressions.push({
      title,
      description,
      check: generatedCheck,
      severity: "medium",
      ...matcher
    });
  }
}

function appendLearnedCodeDecayReport(memory: CodeDecayMemory, report: Record<string, unknown>): void {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const recommendedTests = Array.isArray(report.recommendedTests)
    ? report.recommendedTests.filter((item): item is string => typeof item === "string")
    : [];
  const impactedAreas = Array.isArray(report.impactedAreas) ? report.impactedAreas : [];
  const reportAreas = impactedAreas
    .map((area) => (isPlainObject(area) && typeof area.kind === "string" ? normalizeAreaKind(area.kind) : undefined))
    .filter((area): area is ImpactedArea["kind"] => Boolean(area));

  for (const finding of findings) {
    if (!isPlainObject(finding)) {
      continue;
    }

    const severity = normalizeRiskValue(finding.severity);
    if (severity === "low") {
      continue;
    }

    const title = optionalString(finding.title, "CodeDecay report", "finding.title") ?? optionalString(finding.ruleId, "CodeDecay report", "finding.ruleId") ?? "CodeDecay finding";
    const description =
      optionalString(finding.description, "CodeDecay report", "finding.description") ??
      `CodeDecay finding ${title} was learned from a blocked or reviewed report.`;
    const file = optionalString(finding.file, "CodeDecay report", "finding.file");
    if (!isActionableLearnedCodeDecayFinding({ file, reportAreas, recommendedTests })) {
      continue;
    }

    const matcher = inferMemoryMatcher(
      {
        files: file ? [file] : undefined,
        areas: reportAreas.length > 0 ? reportAreas : undefined
      },
      `${title}\n${description}\n${file ?? ""}`
    );

    memory.regressions.push({
      title: `CodeDecay: ${title}`,
      description,
      check: recommendedTests[0] ?? `Re-check CodeDecay finding: ${title}`,
      severity,
      ...matcher
    });
  }
}

function isActionableLearnedCodeDecayFinding(input: {
  file: string | undefined;
  reportAreas: ImpactedArea["kind"][];
  recommendedTests: string[];
}): boolean {
  return Boolean(input.file) || input.reportAreas.length > 0 || input.recommendedTests.length > 0;
}

function appendLearnedProductReport(memory: CodeDecayMemory, report: Record<string, unknown>): void {
  const targets = Array.isArray(report.targets) ? report.targets : [];

  for (const targetValue of targets) {
    const target = asRecord(targetValue);
    if (!target) {
      continue;
    }

    appendLearnedProductGeneratedChecks(memory, target, {
      generatedKey: "generatedTests",
      runKey: "generatedTestRun",
      area: "ui",
      runFlag: "--run-generated-tests"
    });
    appendLearnedProductGeneratedChecks(memory, target, {
      generatedKey: "generatedApiTests",
      runKey: "generatedApiTestRun",
      area: "api",
      runFlag: "--run-generated-api-tests"
    });
    appendLearnedProductWorkflowFailure(memory, target);
  }
}

function appendLearnedProductGeneratedChecks(
  memory: CodeDecayMemory,
  target: Record<string, unknown>,
  input: {
    generatedKey: "generatedTests" | "generatedApiTests";
    runKey: "generatedTestRun" | "generatedApiTestRun";
    area: "ui" | "api";
    runFlag: "--run-generated-tests" | "--run-generated-api-tests";
  }
): void {
  const generated = asRecord(target[input.generatedKey]);
  const run = asRecord(target[input.runKey]);
  const tests = Array.isArray(generated?.tests) ? generated.tests : [];
  const failures = Array.isArray(run?.failures) ? run.failures : [];
  const targetId = stringValue(target.id) ?? "product";
  if (stringValue(run?.status) === "passed") {
    for (const testValue of tests) {
      const test = asRecord(testValue);
      if (!test) {
        continue;
      }

      if (test.destructive === true) {
        continue;
      }

      const id = stringValue(test.id);
      const title = safeLearnedText(stringValue(test.title) ?? id ?? "Generated product check");
      const productPaths = productPathsFromTest(test);
      const rerunCommand = productRerunCommand(targetId, input.runFlag, id);

      memory.flows.push({
        name: `Product check: ${targetId}: ${title}`,
        description: `Passed generated ${input.area.toUpperCase()} product check for target ${targetId}.`,
        checks: [rerunCommand],
        areas: [input.area],
        ...(productPaths.length > 0 ? { productPaths } : {})
      });
    }
  }

  for (const failureValue of failures) {
    const failure = asRecord(failureValue);
    if (!failure) {
      continue;
    }

    const failureId = stringValue(failure.testId);
    const failureTitle = stringValue(failure.title);
    const matchingTest = tests
      .map((test) => asRecord(test))
      .find((test) => {
        if (!test) {
          return false;
        }

        return Boolean(
          (failureId && stringValue(test.id) === failureId) ||
            (failureTitle && stringValue(test.title) === failureTitle) ||
            (failureTitle && stringValue(test.title) && failureTitle.includes(stringValue(test.title) ?? ""))
        );
      });
    const title = safeLearnedText(failureTitle ?? stringValue(matchingTest?.title) ?? failureId ?? "Generated product check failed");
    const descriptionSource =
      stringValue(failure.error) ??
      stringValue(failure.actual) ??
      stringValue(failure.failingStep) ??
      `Generated ${input.area.toUpperCase()} product check failed for target ${targetId}.`;
    const productPaths = dedupeStrings([
      ...productPathsFromTest(matchingTest),
      ...productPathsFromFailure(failure)
    ]);
    const files = stringArray(failure.impactedFiles);

    memory.regressions.push({
      title: `Product regression: ${targetId}: ${title}`,
      description: safeLearnedText(`Generated ${input.area.toUpperCase()} product check failed for target ${targetId}. ${descriptionSource}`),
      check: safeLearnedText(stringValue(failure.rerunCommand) ?? productRerunCommand(targetId, input.runFlag, failureId)),
      severity: "high",
      ...(files.length > 0 ? { files } : {}),
      ...(productPaths.length > 0 ? { productPaths } : {})
    });
  }
}

function appendLearnedProductWorkflowFailure(memory: CodeDecayMemory, target: Record<string, unknown>): void {
  const status = stringValue(target.status);
  if (!status || !["failed", "blocked", "timed_out"].includes(status)) {
    return;
  }

  const hasGeneratedFailures = ["generatedTestRun", "generatedApiTestRun"].some((key) => {
    const run = asRecord(target[key]);
    return Array.isArray(run?.failures) && run.failures.length > 0;
  });
  if (hasGeneratedFailures) {
    return;
  }

  const targetId = stringValue(target.id) ?? "product";
  const reason = productWorkflowFailureReason(target) ?? `Product target ended with status ${status}.`;
  const productPath = productPathFromUnknown(target.healthCheck) ?? productPathFromUnknown(target.baseUrl);

  memory.regressions.push({
    title: `Product workflow: ${targetId}: ${status.replace("_", " ")}`,
    description: safeLearnedText(reason),
    check: `npx codedecay product --target ${targetId} --format markdown`,
    severity: status === "failed" ? "high" : "medium",
    ...(productPath ? { productPaths: [productPath] } : {})
  });
}

function productPathsFromTest(test: Record<string, unknown> | undefined): string[] {
  if (!test) {
    return [];
  }

  return dedupeStrings(
    [
      productPathFromUnknown(test.operationPath),
      productPathFromUnknown(test.pageUrl),
      productPathFromUnknown(test.targetUrl)
    ].filter((path): path is string => Boolean(path))
  );
}

function productPathsFromFailure(failure: Record<string, unknown>): string[] {
  const request = asRecord(failure.request);
  return dedupeStrings([productPathFromUnknown(request?.url)].filter((path): path is string => Boolean(path)));
}

function productPathFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return normalizeProductPath(url.pathname);
  } catch {
    if (!trimmed.startsWith("/")) {
      return undefined;
    }

    return normalizeProductPath(trimmed.split(/[?#]/, 1)[0] ?? trimmed);
  }
}

function productRerunCommand(
  targetId: string,
  runFlag: "--run-generated-tests" | "--run-generated-api-tests",
  testId: string | undefined
): string {
  const testIdArg = testId ? ` --test-id ${testId}` : "";
  return `npx codedecay product --target ${targetId} ${runFlag}${testIdArg} --format markdown`;
}

function productWorkflowFailureReason(target: Record<string, unknown>): string | undefined {
  for (const key of ["setup", "start", "health", "exploration", "generatedTests", "generatedApiTests", "teardown"]) {
    const value = asRecord(target[key]);
    const reason = stringValue(value?.error) ?? stringValue(value?.stderr) ?? stringValue(value?.blockedReason);
    if (reason) {
      return reason;
    }
  }

  return undefined;
}

function safeLearnedText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(
      /\b(token|access_token|refresh_token|api[_-]?key|secret|password|session|cookie)=([^&\s]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? dedupeStrings(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))
    : [];
}

function collectLearnedReports(object: Record<string, unknown>): Record<string, unknown>[] {
  return [
    ...normalizeReportArray(object.reports),
    ...normalizeReportArray(object.codeDecayReports),
    ...normalizeReportArray(object.failOnReports),
    ...normalizeReportArray(object.blockedReports)
  ];
}

function collectLearnedProductReports(object: Record<string, unknown>): Record<string, unknown>[] {
  return [
    ...normalizeReportArray(object.productReports),
    ...normalizeReportArray(object.productVerificationReports),
    ...normalizeReportArray(object.productTargetReports),
    ...normalizeReportArray(object.reports),
    ...normalizeReportArray(object.codeDecayReports),
    ...normalizeReportArray(object.failOnReports),
    ...normalizeReportArray(object.blockedReports)
  ].filter(isProductTargetReportLike);
}

function normalizeReportArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => isPlainObject(item));
}

function isCodeDecayReportLike(value: Record<string, unknown>): boolean {
  return value.tool === "CodeDecay" && Array.isArray(value.findings);
}

function isProductTargetReportLike(value: Record<string, unknown>): boolean {
  return value.tool === "CodeDecay" && Array.isArray(value.targets);
}

function inferMemoryMatcher(object: Record<string, unknown>, text: string): MemoryMatcher {
  const files = collectMatcherFiles(object);
  const areas = dedupeAreas([
    ...collectMatcherAreas(object),
    ...files.map(inferAreaFromFile).filter((area): area is ImpactedArea["kind"] => Boolean(area)),
    ...inferAreasFromText(text)
  ]);
  const matcher: MemoryMatcher = {};

  if (files.length > 0) {
    matcher.files = files;
  }

  if (areas.length > 0) {
    matcher.areas = areas;
  }

  return matcher;
}

function collectMatcherFiles(object: Record<string, unknown>): string[] {
  const values: string[] = [];
  if (typeof object.file === "string") {
    values.push(object.file);
  }

  if (Array.isArray(object.files)) {
    values.push(...object.files.filter((item): item is string => typeof item === "string"));
  }

  if (Array.isArray(object.changedFiles)) {
    values.push(
      ...object.changedFiles.flatMap((item) => {
        if (typeof item === "string") {
          return [item];
        }

        if (isPlainObject(item) && typeof item.path === "string") {
          return [item.path];
        }

        return [];
      })
    );
  }

  return dedupeStrings(values.filter((item) => item.trim().length > 0));
}

function collectMatcherAreas(object: Record<string, unknown>): ImpactedArea["kind"][] {
  if (!Array.isArray(object.areas)) {
    return [];
  }

  return object.areas
    .map((area) => (typeof area === "string" ? normalizeAreaKind(area) : undefined))
    .filter((area): area is ImpactedArea["kind"] => Boolean(area));
}

function inferAreaFromFile(path: string): ImpactedArea["kind"] | undefined {
  const normalized = path.toLowerCase();
  if (/(^|\/)(auth|session|jwt|oauth|middleware|permissions?|rbac|acl)(\/|\.|-|_)/.test(normalized)) {
    return "auth";
  }

  if (/(^|\/)(schema\.prisma|migrations?|drizzle|knex|sequelize|typeorm|db|database|models?)(\/|\.|-|_|$)/.test(normalized)) {
    return "database";
  }

  if (/(^|\/)(pages\/api|app\/api|api|routes?|controllers?)(\/|\.|-|_)/.test(normalized)) {
    return "api";
  }

  if (/(^|\/)(app|pages|routes|screens|views|components)(\/|\.|-|_)/.test(normalized)) {
    return "ui";
  }

  if (/(^|\/)(docs?|readme|changelog|adr)(\/|\.|$)|\.(md|mdx|txt)$/.test(normalized)) {
    return "docs";
  }

  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|\.|-|_)/.test(normalized)) {
    return "test";
  }

  if (/(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|tsconfig|vite\.config|webpack\.config|\.github\/workflows)/.test(normalized)) {
    return "config";
  }

  return "source";
}

function inferAreasFromText(text: string): ImpactedArea["kind"][] {
  const normalized = text.toLowerCase();
  const areas: ImpactedArea["kind"][] = [];

  if (/\b(auth|session|jwt|oauth|token|permission|rbac|acl|login)\b/.test(normalized)) {
    areas.push("auth");
  }

  if (/\b(api|route|controller|endpoint|request|response|http|graphql|rest)\b/.test(normalized)) {
    areas.push("api");
  }

  if (/\b(db|database|schema|migration|prisma|sql|model)\b/.test(normalized)) {
    areas.push("database");
  }

  if (/\b(ui|page|screen|view|component|render|frontend)\b/.test(normalized)) {
    areas.push("ui");
  }

  if (/\b(config|build|deploy|workflow|ci|package|dependency|lockfile)\b/.test(normalized)) {
    areas.push("config");
  }

  if (/\b(test|spec|coverage|assert|mutation)\b/.test(normalized)) {
    areas.push("test");
  }

  return dedupeAreas(areas);
}

function normalizeAreaKind(value: string): ImpactedArea["kind"] | undefined {
  return ["api", "ui", "database", "auth", "config", "test", "source", "docs"].includes(value)
    ? (value as ImpactedArea["kind"])
    : undefined;
}

function normalizeRiskValue(value: unknown): RiskLevel {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function dedupeAreas(values: ImpactedArea["kind"][]): ImpactedArea["kind"][] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function looksLikeRegressionLearning(text: string): boolean {
  return /\b(fix|fixed|bug|regression|incident|failure|failed|broken|prevent|restore|wrong|missing|not refreshing|unauthorized|forbidden)\b/i.test(
    text
  );
}

function inferCheckFromText(title: string, text: string): string {
  const trimmedTitle = title.trim();
  if (/\b(auth|session|token|unauthorized|forbidden)\b/i.test(text)) {
    return `Verify auth/session regression path for ${trimmedTitle}`;
  }

  if (/\b(api|route|endpoint|request|response)\b/i.test(text)) {
    return `Verify API regression path for ${trimmedTitle}`;
  }

  if (/\b(db|database|schema|migration)\b/i.test(text)) {
    return `Verify database regression path for ${trimmedTitle}`;
  }

  return `Verify regression path for ${trimmedTitle}`;
}

function matchesMemoryEntry(entry: MemoryMatcher, changedFiles: FileChange[], impactedAreas: ImpactedArea[]): boolean {
  return Boolean(firstMatchingFile(entry, changedFiles, impactedAreas));
}

function firstMatchingFile(
  entry: MemoryMatcher,
  changedFiles: FileChange[],
  impactedAreas: ImpactedArea[]
): FileChange | undefined {
  const matchingAreaFiles = new Set(
    impactedAreas
      .filter((area) => entry.areas?.includes(area.kind))
      .flatMap((area) => area.files)
  );

  return changedFiles.find((file) => {
    if (matchingAreaFiles.has(file.path)) {
      return true;
    }

    return entry.files?.some((pattern) => matchesPathPattern(file.path, pattern)) ?? false;
  });
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

function firstLine(change: FileChange): number | undefined {
  return change.addedLines[0]?.line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
