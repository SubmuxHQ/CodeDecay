import { stableHash } from "./hashing";
import type {
  CreateEvidenceInput,
  Evidence,
  EvidenceGroupsBySeverity,
  EvidenceSeverity,
  EvidenceSource
} from "./types";

const SEVERITY_ORDER: Record<EvidenceSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3
};

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

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}
