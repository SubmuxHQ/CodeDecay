import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
  FileChange,
  Finding,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";

export interface CodeDecayMemory {
  version: 1;
  flows: MemoryFlow[];
  commands: MemoryCommand[];
  invariants: MemoryInvariant[];
  architecture: MemoryArchitectureNote[];
  regressions: MemoryRegression[];
}

export interface MemoryMatcher {
  files?: string[] | undefined;
  areas?: ImpactedArea["kind"][] | undefined;
}

export interface MemoryFlow extends MemoryMatcher {
  name: string;
  description?: string | undefined;
  checks?: string[] | undefined;
}

export interface MemoryCommand extends MemoryMatcher {
  name: string;
  command: string;
  description?: string | undefined;
}

export interface MemoryInvariant extends MemoryMatcher {
  name: string;
  description: string;
  severity?: RiskLevel | undefined;
}

export interface MemoryArchitectureNote extends MemoryMatcher {
  title: string;
  note: string;
}

export interface MemoryRegression extends MemoryMatcher {
  title: string;
  description: string;
  check?: string | undefined;
  severity?: RiskLevel | undefined;
}

export interface LoadedCodeDecayMemory {
  memory: CodeDecayMemory;
  sourcePath?: string | undefined;
}

export type MemoryProviderKind = "local" | "external";

export interface MemoryProviderLoadOptions {
  rootDir: string;
}

export interface MemoryProvider {
  id: string;
  name: string;
  kind: MemoryProviderKind;
  load(options: MemoryProviderLoadOptions): LoadedCodeDecayMemory;
}

export interface MemoryContextInput {
  memory: CodeDecayMemory;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  analyzerResult: AnalyzerResult;
}

export const DEFAULT_CODEDECAY_MEMORY: CodeDecayMemory = {
  version: 1,
  flows: [],
  commands: [],
  invariants: [],
  architecture: [],
  regressions: []
};

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

  if (files) {
    matcher.files = files;
  }

  if (areas) {
    matcher.areas = areas;
  }

  return matcher;
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

function cloneMemory(memory: CodeDecayMemory): CodeDecayMemory {
  return {
    version: 1,
    flows: memory.flows.map((flow) => ({ ...flow, files: flow.files ? [...flow.files] : undefined, areas: flow.areas ? [...flow.areas] : undefined, checks: flow.checks ? [...flow.checks] : undefined })),
    commands: memory.commands.map((command) => ({ ...command, files: command.files ? [...command.files] : undefined, areas: command.areas ? [...command.areas] : undefined })),
    invariants: memory.invariants.map((invariant) => ({ ...invariant, files: invariant.files ? [...invariant.files] : undefined, areas: invariant.areas ? [...invariant.areas] : undefined })),
    architecture: memory.architecture.map((note) => ({ ...note, files: note.files ? [...note.files] : undefined, areas: note.areas ? [...note.areas] : undefined })),
    regressions: memory.regressions.map((regression) => ({ ...regression, files: regression.files ? [...regression.files] : undefined, areas: regression.areas ? [...regression.areas] : undefined }))
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
