import type {
  CodeDecayHarness,
  CreateEvidenceInput,
  Evidence,
  EvidenceGroupsBySeverity,
  EvidenceSeverity,
  EvidenceSource,
  HarnessCapability,
  HarnessFailureMode,
  HarnessRunResult,
  HarnessRunStatus,
  HarnessSummary
} from "./types";

export type {
  CodeDecayHarness,
  ConfigRequirement,
  CreateEvidenceInput,
  Evidence,
  EvidenceGroupsBySeverity,
  EvidenceKind,
  EvidenceSeverity,
  EvidenceSource,
  EvidenceSourceKind,
  HarnessArtifact,
  HarnessCapability,
  HarnessFailure,
  HarnessFailureMode,
  HarnessPlan,
  HarnessPlanInput,
  HarnessPlanStep,
  HarnessRunContext,
  HarnessRunResult,
  HarnessRunStatus,
  HarnessSummary
} from "./types";

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
