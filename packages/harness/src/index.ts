export type EvidenceSeverity = "info" | "low" | "medium" | "high";

export type EvidenceKind =
  | "diff"
  | "impact"
  | "test"
  | "coverage"
  | "mutation"
  | "api-fuzz"
  | "contract"
  | "browser-flow"
  | "memory"
  | "agent-suggestion"
  | "execution";

export type EvidenceSourceKind =
  | "codedecay"
  | "harness"
  | "tool"
  | "agent"
  | "memory"
  | "user";

export interface EvidenceSource {
  kind: EvidenceSourceKind;
  name: string;
  id?: string | undefined;
}

export interface Evidence {
  id: string;
  source: EvidenceSource;
  kind: EvidenceKind;
  severity: EvidenceSeverity;
  summary: string;
  trusted: boolean;
  file?: string | undefined;
  line?: number | undefined;
  command?: string | undefined;
  artifactPath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type HarnessCapability =
  | "agent-reasoning"
  | "test-execution"
  | "browser-flow"
  | "api-fuzzing"
  | "mutation-testing"
  | "contract-testing"
  | "coverage"
  | "memory"
  | "impact-map"
  | "execution";

export type HarnessFailureMode =
  | "missing-tool"
  | "missing-config"
  | "command-denied"
  | "timeout"
  | "nonzero-exit"
  | "network-required"
  | "unsafe-command"
  | "model-unavailable"
  | "no-evidence"
  | "internal-error";

export type HarnessRunStatus = "passed" | "failed" | "skipped" | "error" | "timed_out";

export interface ConfigRequirement {
  key: string;
  description: string;
  required: boolean;
}

export interface HarnessPlanInput {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  evidence: Evidence[];
  context?: Record<string, unknown> | undefined;
}

export interface HarnessPlanStep {
  id: string;
  title: string;
  description?: string | undefined;
}

export interface HarnessPlan {
  id: string;
  harnessName: string;
  summary: string;
  steps: HarnessPlanStep[];
  requiresApproval: boolean;
}

export interface HarnessRunContext {
  cwd: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface HarnessFailure {
  mode: HarnessFailureMode;
  message: string;
  evidence?: Evidence[] | undefined;
}

export interface HarnessArtifact {
  path: string;
  description?: string | undefined;
}

export interface HarnessRunResult {
  harnessName: string;
  status: HarnessRunStatus;
  durationMs: number;
  evidence: Evidence[];
  artifacts: HarnessArtifact[];
  summary?: string | undefined;
  failure?: HarnessFailure | undefined;
}

export interface HarnessSummary {
  harnessName: string;
  status: HarnessRunStatus;
  summary: string;
  evidenceCount: number;
  failure?: HarnessFailure | undefined;
}

export interface CodeDecayHarness {
  name: string;
  capabilities: HarnessCapability[];
  requiredConfig: ConfigRequirement[];
  plan(input: HarnessPlanInput): Promise<HarnessPlan>;
  run(plan: HarnessPlan, context: HarnessRunContext): Promise<HarnessRunResult>;
  collectEvidence(result: HarnessRunResult): Promise<Evidence[]>;
  summarize(evidence: Evidence[]): Promise<HarnessSummary>;
}

export interface CreateEvidenceInput {
  id?: string | undefined;
  source: EvidenceSource;
  kind: EvidenceKind;
  severity?: EvidenceSeverity | undefined;
  summary: string;
  trusted?: boolean | undefined;
  file?: string | undefined;
  line?: number | undefined;
  command?: string | undefined;
  artifactPath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type EvidenceGroupsBySeverity = Record<EvidenceSeverity, Evidence[]>;

const SEVERITY_ORDER: Record<EvidenceSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3
};

export class HarnessRegistry {
  private readonly harnesses = new Map<string, CodeDecayHarness>();

  constructor(harnesses: CodeDecayHarness[] = []) {
    for (const harness of harnesses) {
      this.register(harness);
    }
  }

  register(harness: CodeDecayHarness): void {
    validateHarness(harness);

    if (this.harnesses.has(harness.name)) {
      throw new Error(`Harness already registered: ${harness.name}`);
    }

    this.harnesses.set(harness.name, harness);
  }

  unregister(name: string): boolean {
    validateNonEmptyString(name, "Harness name");
    return this.harnesses.delete(name);
  }

  get(name: string): CodeDecayHarness | undefined {
    validateNonEmptyString(name, "Harness name");
    return this.harnesses.get(name);
  }

  require(name: string): CodeDecayHarness {
    const harness = this.get(name);
    if (!harness) {
      throw new Error(`Harness not found: ${name}`);
    }

    return harness;
  }

  list(): CodeDecayHarness[] {
    return [...this.harnesses.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  findByCapability(capability: HarnessCapability): CodeDecayHarness[] {
    return this.list().filter((harness) => harness.capabilities.includes(capability));
  }
}

export function createHarnessRegistry(harnesses: CodeDecayHarness[] = []): HarnessRegistry {
  return new HarnessRegistry(harnesses);
}

export function createEvidence(input: CreateEvidenceInput): Evidence {
  validateEvidenceInput(input);

  const evidence: Evidence = {
    id: input.id ?? createEvidenceId(input),
    source: normalizeEvidenceSource(input.source),
    kind: input.kind,
    severity: input.severity ?? "info",
    summary: input.summary.trim(),
    trusted: input.trusted ?? false
  };

  if (input.file !== undefined) {
    evidence.file = input.file;
  }

  if (input.line !== undefined) {
    evidence.line = input.line;
  }

  if (input.command !== undefined) {
    evidence.command = input.command;
  }

  if (input.artifactPath !== undefined) {
    evidence.artifactPath = input.artifactPath;
  }

  if (input.metadata !== undefined) {
    evidence.metadata = { ...input.metadata };
  }

  return evidence;
}

export function sortEvidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((left, right) => {
    const severity = SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity];
    if (severity !== 0) {
      return severity;
    }

    const kind = left.kind.localeCompare(right.kind);
    if (kind !== 0) {
      return kind;
    }

    return left.id.localeCompare(right.id);
  });
}

export function groupEvidenceBySeverity(evidence: Evidence[]): EvidenceGroupsBySeverity {
  return sortEvidence(evidence).reduce<EvidenceGroupsBySeverity>(
    (groups, item) => {
      groups[item.severity].push(item);
      return groups;
    },
    {
      info: [],
      low: [],
      medium: [],
      high: []
    }
  );
}

export function createHarnessFailureResult(input: {
  harnessName: string;
  mode: HarnessFailureMode;
  message: string;
  status?: HarnessRunStatus | undefined;
  durationMs?: number | undefined;
  evidence?: Evidence[] | undefined;
}): HarnessRunResult {
  validateNonEmptyString(input.harnessName, "Harness name");
  validateNonEmptyString(input.message, "Harness failure message");

  const evidence = input.evidence ? sortEvidence(input.evidence) : [];

  return {
    harnessName: input.harnessName,
    status: input.status ?? statusForFailureMode(input.mode),
    durationMs: input.durationMs ?? 0,
    evidence,
    artifacts: [],
    summary: input.message,
    failure: {
      mode: input.mode,
      message: input.message,
      evidence
    }
  };
}

export function summarizeHarnessResult(result: HarnessRunResult): HarnessSummary {
  return {
    harnessName: result.harnessName,
    status: result.status,
    summary: result.summary ?? result.failure?.message ?? `${result.harnessName} produced ${result.evidence.length} evidence item(s).`,
    evidenceCount: result.evidence.length,
    failure: result.failure
  };
}

function validateHarness(harness: CodeDecayHarness): void {
  validateNonEmptyString(harness.name, "Harness name");

  if (!Array.isArray(harness.capabilities) || harness.capabilities.length === 0) {
    throw new Error(`Harness ${harness.name} must declare at least one capability.`);
  }

  const duplicateCapabilities = findDuplicates(harness.capabilities);
  if (duplicateCapabilities.length > 0) {
    throw new Error(`Harness ${harness.name} has duplicate capabilities: ${duplicateCapabilities.join(", ")}`);
  }

  if (!Array.isArray(harness.requiredConfig)) {
    throw new Error(`Harness ${harness.name} requiredConfig must be an array.`);
  }
}

function validateEvidenceInput(input: CreateEvidenceInput): void {
  validateEvidenceSource(input.source);
  validateNonEmptyString(input.summary, "Evidence summary");

  if (input.id !== undefined) {
    validateNonEmptyString(input.id, "Evidence id");
  }

  if (input.file !== undefined) {
    validateNonEmptyString(input.file, "Evidence file");
  }

  if (input.line !== undefined && (!Number.isInteger(input.line) || input.line <= 0)) {
    throw new Error("Evidence line must be a positive integer.");
  }

  if (input.command !== undefined) {
    validateNonEmptyString(input.command, "Evidence command");
  }

  if (input.artifactPath !== undefined) {
    validateNonEmptyString(input.artifactPath, "Evidence artifactPath");
  }
}

function validateEvidenceSource(source: EvidenceSource): void {
  validateNonEmptyString(source.name, "Evidence source name");
  if (source.id !== undefined) {
    validateNonEmptyString(source.id, "Evidence source id");
  }
}

function normalizeEvidenceSource(source: EvidenceSource): EvidenceSource {
  const normalized: EvidenceSource = {
    kind: source.kind,
    name: source.name.trim()
  };

  if (source.id !== undefined) {
    normalized.id = source.id.trim();
  }

  return normalized;
}

function createEvidenceId(input: CreateEvidenceInput): string {
  return `ev-${stableHash([
    input.source.kind,
    input.source.name.trim(),
    input.kind,
    input.summary.trim(),
    input.file?.trim() ?? "",
    String(input.line ?? "")
  ].join("\u001f"))}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function statusForFailureMode(mode: HarnessFailureMode): HarnessRunStatus {
  if (mode === "timeout") {
    return "timed_out";
  }

  if (mode === "missing-tool" || mode === "missing-config" || mode === "command-denied" || mode === "network-required") {
    return "skipped";
  }

  if (mode === "nonzero-exit" || mode === "unsafe-command" || mode === "no-evidence") {
    return "failed";
  }

  return "error";
}

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort((left, right) => left.localeCompare(right));
}
