import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
  FileChange,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { DEFAULT_CODEDECAY_MEMORY } from "./types";
import type {
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
  MemoryProviderLoadOptions,
  MemoryRegression
} from "./types";

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

export function loadCodeDecayMemory(rootDir: string): LoadedCodeDecayMemory {
  return createLocalMemoryProvider().load({ rootDir });
}

export function loadCodeDecayMemoryFromProvider(
  provider: MemoryProvider,
  options: MemoryProviderLoadOptions
): LoadedCodeDecayMemory {
  validateMemoryProvider(provider);
  validateMemoryProviderLoadOptions(options);
  return provider.load(options);
}

export function createLocalMemoryProvider(): MemoryProvider {
  return {
    id: "local",
    name: "Local .codedecay memory",
    kind: "local",
    load: ({ rootDir }) => loadLocalMemory(rootDir)
  };
}

export class MemoryProviderRegistry {
  private readonly providers = new Map<string, MemoryProvider>();

  constructor(providers: MemoryProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: MemoryProvider): void {
    validateMemoryProvider(provider);

    if (this.providers.has(provider.id)) {
      throw new Error(`Memory provider already registered: ${provider.id}`);
    }

    this.providers.set(provider.id, provider);
  }

  get(id: string): MemoryProvider | undefined {
    validateNonEmptyString(id, "Memory provider id");
    return this.providers.get(id);
  }

  require(id: string): MemoryProvider {
    const provider = this.get(id);
    if (!provider) {
      throw new Error(`Memory provider not found: ${id}`);
    }

    return provider;
  }

  list(): MemoryProvider[] {
    return [...this.providers.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  load(id: string, options: MemoryProviderLoadOptions): LoadedCodeDecayMemory {
    return loadCodeDecayMemoryFromProvider(this.require(id), options);
  }
}

export function createMemoryProviderRegistry(providers: MemoryProvider[] = [createLocalMemoryProvider()]): MemoryProviderRegistry {
  return new MemoryProviderRegistry(providers);
}

export function importCodeDecayMemory(
  baseMemory: CodeDecayMemory,
  importedValue: unknown,
  sourceName: string = "memory import"
): MemoryImportResult {
  const importedMemory = normalizeImportedMemory(importedValue, sourceName);
  const base = cloneMemory(baseMemory);
  const added = createEmptyMemoryImportCounts();
  const merged = createEmptyMemoryImportCounts();

  return {
    memory: {
      version: 1,
      flows: mergeFlowEntries(base.flows, importedMemory.flows, added, merged),
      commands: mergeCommandEntries(base.commands, importedMemory.commands, added, merged),
      invariants: mergeInvariantEntries(base.invariants, importedMemory.invariants, added, merged),
      architecture: mergeArchitectureEntries(base.architecture, importedMemory.architecture, added, merged),
      regressions: mergeRegressionEntries(base.regressions, importedMemory.regressions, added, merged)
    },
    added,
    merged
  };
}

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

function normalizeImportedMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  const object = normalizeObject(value, sourcePath, "root");
  if (object.version !== undefined && object.version !== 1) {
    throw new Error(`Invalid CodeDecay memory import at ${sourcePath}: version must be 1.`);
  }

  const flows = normalizeArray(object.flows, sourcePath, "flows").map((item, index) => normalizeFlow(item, index, sourcePath));
  const commands = normalizeArray(object.commands, sourcePath, "commands").map((item, index) => normalizeCommand(item, index, sourcePath));
  const invariants = normalizeArray(object.invariants, sourcePath, "invariants").map((item, index) => normalizeInvariant(item, index, sourcePath));
  const architecture = normalizeArray(object.architecture, sourcePath, "architecture").map((item, index) =>
    normalizeArchitectureNote(item, index, sourcePath)
  );
  const regressions = normalizeArray(object.regressions, sourcePath, "regressions").map((item, index) =>
    normalizeRegression(item, index, sourcePath)
  );
  const ciFailures = normalizeArray(object.ciFailures, sourcePath, "ciFailures").map((item, index) =>
    normalizeImportedRegression(item, index, sourcePath, "ciFailures")
  );
  const incidents = normalizeArray(object.incidents, sourcePath, "incidents").map((item, index) =>
    normalizeImportedRegression(item, index, sourcePath, "incidents")
  );
  const pullRequests = normalizeArray(object.pullRequests, sourcePath, "pullRequests").map((item, index) =>
    normalizeImportedPullRequest(item, index, sourcePath)
  );

  return {
    version: 1,
    flows: sortFlows([...flows, ...pullRequests.flatMap((entry) => entry.flows)]),
    commands: sortCommands([...commands, ...pullRequests.flatMap((entry) => entry.commands)]),
    invariants: sortInvariants(invariants),
    architecture: sortArchitecture([...architecture, ...pullRequests.flatMap((entry) => entry.architecture)]),
    regressions: sortRegressions([
      ...regressions,
      ...ciFailures,
      ...incidents,
      ...pullRequests.flatMap((entry) => entry.regressions)
    ])
  };
}

function normalizeImportedRegression(
  value: unknown,
  index: number,
  sourcePath: string,
  field: "ciFailures" | "incidents"
): MemoryRegression {
  const object = normalizeObject(value, sourcePath, `${field}[${index}]`);
  return {
    title: requiredString(object.title ?? object.name, sourcePath, `${field}[${index}].title`),
    description: requiredString(object.description ?? object.summary, sourcePath, `${field}[${index}].description`),
    check: optionalString(object.check, sourcePath, `${field}[${index}].check`),
    severity: optionalRiskLevel(object.severity, sourcePath, `${field}[${index}].severity`) ?? "high",
    ...normalizeMatcher(object, sourcePath, `${field}[${index}]`)
  };
}

function normalizeImportedPullRequest(
  value: unknown,
  index: number,
  sourcePath: string
): {
  flows: MemoryFlow[];
  commands: MemoryCommand[];
  architecture: MemoryArchitectureNote[];
  regressions: MemoryRegression[];
} {
  const object = normalizeObject(value, sourcePath, `pullRequests[${index}]`);
  const title = requiredString(object.title, sourcePath, `pullRequests[${index}].title`);
  const description =
    optionalString(object.description, sourcePath, `pullRequests[${index}].description`) ??
    optionalString(object.summary, sourcePath, `pullRequests[${index}].summary`) ??
    `Merged PR learning for ${title}.`;
  const matcher = normalizeMatcher(object, sourcePath, `pullRequests[${index}]`);
  const checks = optionalStringArray(object.checks, sourcePath, `pullRequests[${index}].checks`) ?? [];
  const command = optionalString(object.command, sourcePath, `pullRequests[${index}].command`);

  return {
    flows:
      checks.length > 0
        ? [
            {
              name: title,
              description,
              checks,
              ...matcher
            }
          ]
        : [],
    commands:
      command
        ? [
            {
              name: `${title} check`,
              command,
              description,
              ...matcher
            }
          ]
        : [],
    architecture: [
      {
        title,
        note: description,
        ...matcher
      }
    ],
    regressions:
      checks.length > 0
        ? [
            {
              title,
              description,
              check: checks[0],
              severity: "medium",
              ...matcher
            }
          ]
        : []
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

function normalizeProductPath(path: string): string {
  const normalized = path.trim().split(/[?#]/, 1)[0] || "/";
  if (normalized === "/") {
    return normalized;
  }

  return trimTrailingSlashes(normalized) || "/";
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
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

function loadLocalMemory(rootDir: string): LoadedCodeDecayMemory {
  const sourcePath = join(rootDir, ".codedecay", "memory.json");
  if (!existsSync(sourcePath)) {
    return {
      memory: cloneMemory(DEFAULT_CODEDECAY_MEMORY)
    };
  }

  const raw = readFileSync(sourcePath, "utf8");
  return {
    memory: normalizeMemory(parseJsonMemory(raw, sourcePath), sourcePath),
    sourcePath
  };
}

function validateMemoryProvider(provider: MemoryProvider): void {
  validateNonEmptyString(provider.id, "Memory provider id");
  validateNonEmptyString(provider.name, "Memory provider name");

  if (provider.kind !== "local" && provider.kind !== "external") {
    throw new Error(`Invalid memory provider kind: ${String(provider.kind)}`);
  }

  if (typeof provider.load !== "function") {
    throw new Error(`Memory provider "${provider.id}" must define load().`);
  }
}

function validateMemoryProviderLoadOptions(options: MemoryProviderLoadOptions): void {
  validateNonEmptyString(options.rootDir, "Memory provider rootDir");
}

function validateNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function parseJsonMemory(raw: string, sourcePath: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${message}`);
  }
}

function normalizeMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: expected an object.`);
  }

  if (value.version !== 1) {
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: version must be 1.`);
  }

  return {
    version: 1,
    flows: normalizeArray(value.flows, sourcePath, "flows").map((item, index) => normalizeFlow(item, index, sourcePath)),
    commands: normalizeArray(value.commands, sourcePath, "commands").map((item, index) => normalizeCommand(item, index, sourcePath)),
    invariants: normalizeArray(value.invariants, sourcePath, "invariants").map((item, index) => normalizeInvariant(item, index, sourcePath)),
    architecture: normalizeArray(value.architecture, sourcePath, "architecture").map((item, index) => normalizeArchitectureNote(item, index, sourcePath)),
    regressions: normalizeArray(value.regressions, sourcePath, "regressions").map((item, index) => normalizeRegression(item, index, sourcePath))
  };
}

function normalizeFlow(value: unknown, index: number, sourcePath: string): MemoryFlow {
  const object = normalizeObject(value, sourcePath, `flows[${index}]`);
  return {
    name: requiredString(object.name, sourcePath, `flows[${index}].name`),
    description: optionalString(object.description, sourcePath, `flows[${index}].description`),
    checks: optionalStringArray(object.checks, sourcePath, `flows[${index}].checks`),
    ...normalizeMatcher(object, sourcePath, `flows[${index}]`)
  };
}

function normalizeCommand(value: unknown, index: number, sourcePath: string): MemoryCommand {
  const object = normalizeObject(value, sourcePath, `commands[${index}]`);
  return {
    name: requiredString(object.name, sourcePath, `commands[${index}].name`),
    command: requiredString(object.command, sourcePath, `commands[${index}].command`),
    description: optionalString(object.description, sourcePath, `commands[${index}].description`),
    ...normalizeMatcher(object, sourcePath, `commands[${index}]`)
  };
}

function normalizeInvariant(value: unknown, index: number, sourcePath: string): MemoryInvariant {
  const object = normalizeObject(value, sourcePath, `invariants[${index}]`);
  return {
    name: requiredString(object.name, sourcePath, `invariants[${index}].name`),
    description: requiredString(object.description, sourcePath, `invariants[${index}].description`),
    severity: optionalRiskLevel(object.severity, sourcePath, `invariants[${index}].severity`),
    ...normalizeMatcher(object, sourcePath, `invariants[${index}]`)
  };
}

function normalizeArchitectureNote(value: unknown, index: number, sourcePath: string): MemoryArchitectureNote {
  const object = normalizeObject(value, sourcePath, `architecture[${index}]`);
  return {
    title: requiredString(object.title, sourcePath, `architecture[${index}].title`),
    note: requiredString(object.note, sourcePath, `architecture[${index}].note`),
    ...normalizeMatcher(object, sourcePath, `architecture[${index}]`)
  };
}

function normalizeRegression(value: unknown, index: number, sourcePath: string): MemoryRegression {
  const object = normalizeObject(value, sourcePath, `regressions[${index}]`);
  return {
    title: requiredString(object.title, sourcePath, `regressions[${index}].title`),
    description: requiredString(object.description, sourcePath, `regressions[${index}].description`),
    check: optionalString(object.check, sourcePath, `regressions[${index}].check`),
    severity: optionalRiskLevel(object.severity, sourcePath, `regressions[${index}].severity`),
    ...normalizeMatcher(object, sourcePath, `regressions[${index}]`)
  };
}

function normalizeMatcher(object: Record<string, unknown>, sourcePath: string, field: string): MemoryMatcher {
  const matcher: MemoryMatcher = {};
  const files = optionalStringArray(object.files, sourcePath, `${field}.files`);
  const areas = optionalAreas(object.areas, sourcePath, `${field}.areas`);
  const productPaths = optionalStringArray(object.productPaths, sourcePath, `${field}.productPaths`);

  if (files) {
    matcher.files = files;
  }

  if (areas) {
    matcher.areas = areas;
  }

  if (productPaths) {
    matcher.productPaths = productPaths.map(normalizeProductPath);
  }

  return matcher;
}

function mergeFlowEntries(
  baseEntries: MemoryFlow[],
  importedEntries: MemoryFlow[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryFlow[] {
  return sortFlows(mergeNamedEntries(baseEntries, importedEntries, "flows", added, merged, mergeFlow));
}

function mergeCommandEntries(
  baseEntries: MemoryCommand[],
  importedEntries: MemoryCommand[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryCommand[] {
  const map = new Map(baseEntries.map((entry) => [commandKey(entry), cloneCommand(entry)]));
  for (const entry of importedEntries) {
    const key = commandKey(entry);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, cloneCommand(entry));
      added.commands += 1;
      continue;
    }

    map.set(key, mergeCommand(existing, entry));
    merged.commands += 1;
  }

  return sortCommands([...map.values()]);
}

function mergeInvariantEntries(
  baseEntries: MemoryInvariant[],
  importedEntries: MemoryInvariant[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryInvariant[] {
  return sortInvariants(mergeNamedEntries(baseEntries, importedEntries, "invariants", added, merged, mergeInvariant));
}

function mergeArchitectureEntries(
  baseEntries: MemoryArchitectureNote[],
  importedEntries: MemoryArchitectureNote[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryArchitectureNote[] {
  return sortArchitecture(mergeNamedEntries(baseEntries, importedEntries, "architecture", added, merged, mergeArchitectureNote));
}

function mergeRegressionEntries(
  baseEntries: MemoryRegression[],
  importedEntries: MemoryRegression[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryRegression[] {
  return sortRegressions(mergeNamedEntries(baseEntries, importedEntries, "regressions", added, merged, mergeRegression, regressionKey));
}

function mergeNamedEntries<
  T extends {
    name?: string;
    title?: string;
    files?: string[] | undefined;
    areas?: ImpactedArea["kind"][] | undefined;
    productPaths?: string[] | undefined;
  }
>(
  baseEntries: T[],
  importedEntries: T[],
  section: keyof MemoryImportCounts,
  added: MemoryImportCounts,
  merged: MemoryImportCounts,
  mergeEntry: (existing: T, incoming: T) => T,
  keyForEntry: (entry: T) => string = namedKey
): T[] {
  const map = new Map(baseEntries.map((entry) => [keyForEntry(entry), structuredCloneEntry(entry)]));
  for (const entry of importedEntries) {
    const key = keyForEntry(entry);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, structuredCloneEntry(entry));
      added[section] += 1;
      continue;
    }

    map.set(key, mergeEntry(existing, entry));
    merged[section] += 1;
  }

  return [...map.values()];
}

function mergeFlow(existing: MemoryFlow, incoming: MemoryFlow): MemoryFlow {
  return {
    name: existing.name,
    description: firstDefinedString(existing.description, incoming.description),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths),
    checks: mergeOptionalStringArrays(existing.checks, incoming.checks)
  };
}

function mergeCommand(existing: MemoryCommand, incoming: MemoryCommand): MemoryCommand {
  return {
    name: existing.name,
    command: existing.command,
    description: firstDefinedString(existing.description, incoming.description),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}

function mergeInvariant(existing: MemoryInvariant, incoming: MemoryInvariant): MemoryInvariant {
  return {
    name: existing.name,
    description: firstDefinedString(existing.description, incoming.description) ?? existing.description,
    severity: higherRisk(existing.severity, incoming.severity),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}

function mergeArchitectureNote(existing: MemoryArchitectureNote, incoming: MemoryArchitectureNote): MemoryArchitectureNote {
  return {
    title: existing.title,
    note: firstDefinedString(existing.note, incoming.note) ?? existing.note,
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}

function mergeRegression(existing: MemoryRegression, incoming: MemoryRegression): MemoryRegression {
  return {
    title: existing.title,
    description: firstDefinedString(existing.description, incoming.description) ?? existing.description,
    check: firstDefinedString(existing.check, incoming.check),
    severity: higherRisk(existing.severity, incoming.severity),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
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

function normalizeArray(value: unknown, sourcePath: string, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be an array.`);
}

function normalizeObject(value: unknown, sourcePath: string, field: string): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be an object.`);
}

function requiredString(value: unknown, sourcePath: string, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} is required.`);
}

function optionalString(value: unknown, sourcePath: string, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a string.`);
}

function optionalStringArray(value: unknown, sourcePath: string, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a string array.`);
}

function optionalRiskLevel(value: unknown, sourcePath: string, field: string): RiskLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be low, medium, or high.`);
}

function optionalAreas(value: unknown, sourcePath: string, field: string): ImpactedArea["kind"][] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const validAreas = new Set(["api", "ui", "database", "auth", "config", "test", "source", "docs"]);
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && validAreas.has(item))) {
    return [...value] as ImpactedArea["kind"][];
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must contain valid impacted area names.`);
}

function createEmptyMemoryImportCounts(): MemoryImportCounts {
  return {
    flows: 0,
    commands: 0,
    invariants: 0,
    architecture: 0,
    regressions: 0
  };
}

function countMemoryEntries(memory: CodeDecayMemory): MemoryImportCounts {
  return {
    flows: memory.flows.length,
    commands: memory.commands.length,
    invariants: memory.invariants.length,
    architecture: memory.architecture.length,
    regressions: memory.regressions.length
  };
}

function commandKey(command: MemoryCommand): string {
  return `${command.name.toLowerCase()}::${command.command.toLowerCase()}`;
}

function namedKey(entry: { name?: string; title?: string }): string {
  return normalizeMemoryKey(entry.name ?? entry.title ?? "");
}

function regressionKey(entry: MemoryRegression): string {
  const title = normalizeMemoryKey(entry.title);
  const files = normalizeMemoryKey(dedupeStrings(entry.files ?? []).join(","));
  const areas = normalizeMemoryKey(dedupeStrings(entry.areas ?? []).join(","));
  const productPaths = normalizeMemoryKey(dedupeStrings(entry.productPaths ?? []).join(","));
  const hasMatcherContext = Boolean(files || areas || productPaths);

  if (hasMatcherContext) {
    return [title, files, areas, productPaths].join("::");
  }

  return [title, normalizeMemoryKey(entry.check ?? ""), normalizeMemoryKey(entry.description).slice(0, 160)].join("::");
}

function normalizeMemoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstDefinedString(left: string | undefined, right: string | undefined): string | undefined {
  return left && left.length > 0 ? left : right;
}

function mergeOptionalStringArrays(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])]);
  return merged.length > 0 ? merged : undefined;
}

function mergeOptionalProductPaths(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])].map(normalizeProductPath));
  return merged.length > 0 ? merged : undefined;
}

function mergeOptionalAreas(
  left: ImpactedArea["kind"][] | undefined,
  right: ImpactedArea["kind"][] | undefined
): ImpactedArea["kind"][] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])]) as ImpactedArea["kind"][];
  return merged.length > 0 ? merged : undefined;
}

function higherRisk(left: RiskLevel | undefined, right: RiskLevel | undefined): RiskLevel | undefined {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  if (left === "high" || right === "high") {
    return "high";
  }

  if (left === "medium" || right === "medium") {
    return "medium";
  }

  return "low";
}

function cloneCommand(command: MemoryCommand): MemoryCommand {
  return {
    ...command,
    files: command.files ? [...command.files] : undefined,
    areas: command.areas ? [...command.areas] : undefined,
    productPaths: command.productPaths ? [...command.productPaths] : undefined
  };
}

function structuredCloneEntry<
  T extends {
    files?: string[] | undefined;
    areas?: ImpactedArea["kind"][] | undefined;
    productPaths?: string[] | undefined;
  }
>(
  entry: T
): T {
  return {
    ...entry,
    files: entry.files ? [...entry.files] : undefined,
    areas: entry.areas ? [...entry.areas] : undefined,
    productPaths: entry.productPaths ? [...entry.productPaths] : undefined
  };
}

function sortFlows(entries: MemoryFlow[]): MemoryFlow[] {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

function sortCommands(entries: MemoryCommand[]): MemoryCommand[] {
  return [...entries].sort((left, right) => `${left.name}:${left.command}`.localeCompare(`${right.name}:${right.command}`));
}

function sortInvariants(entries: MemoryInvariant[]): MemoryInvariant[] {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

function sortArchitecture(entries: MemoryArchitectureNote[]): MemoryArchitectureNote[] {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title));
}

function sortRegressions(entries: MemoryRegression[]): MemoryRegression[] {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title));
}

function cloneMemory(memory: CodeDecayMemory): CodeDecayMemory {
  return {
    version: 1,
    flows: memory.flows.map((flow) => ({
      ...flow,
      files: flow.files ? [...flow.files] : undefined,
      areas: flow.areas ? [...flow.areas] : undefined,
      productPaths: flow.productPaths ? [...flow.productPaths] : undefined,
      checks: flow.checks ? [...flow.checks] : undefined
    })),
    commands: memory.commands.map((command) => ({
      ...command,
      files: command.files ? [...command.files] : undefined,
      areas: command.areas ? [...command.areas] : undefined,
      productPaths: command.productPaths ? [...command.productPaths] : undefined
    })),
    invariants: memory.invariants.map((invariant) => ({
      ...invariant,
      files: invariant.files ? [...invariant.files] : undefined,
      areas: invariant.areas ? [...invariant.areas] : undefined,
      productPaths: invariant.productPaths ? [...invariant.productPaths] : undefined
    })),
    architecture: memory.architecture.map((note) => ({
      ...note,
      files: note.files ? [...note.files] : undefined,
      areas: note.areas ? [...note.areas] : undefined,
      productPaths: note.productPaths ? [...note.productPaths] : undefined
    })),
    regressions: memory.regressions.map((regression) => ({
      ...regression,
      files: regression.files ? [...regression.files] : undefined,
      areas: regression.areas ? [...regression.areas] : undefined,
      productPaths: regression.productPaths ? [...regression.productPaths] : undefined
    }))
  };
}

function isEmptyMemory(memory: CodeDecayMemory): boolean {
  return (
    memory.flows.length === 0 &&
    memory.commands.length === 0 &&
    memory.invariants.length === 0 &&
    memory.architecture.length === 0 &&
    memory.regressions.length === 0
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstLine(change: FileChange): number | undefined {
  return change.addedLines[0]?.line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
