import type { Finding } from "../types/findings";
import type { CodeDecayReport } from "../types/report";
import type { SecurityCandidate } from "../types/security";
import { CODEDECAY_VERSION } from "../version";
import type {
  RevalidationCurrentFile,
  RevalidationInput,
  RevalidationItem,
  RevalidationItemKind,
  RevalidationMemorySuggestion,
  RevalidationReport,
  RevalidationStatus
} from "./types";

export type {
  RevalidationCurrentFile,
  RevalidationInput,
  RevalidationItem,
  RevalidationItemKind,
  RevalidationMarkOptions,
  RevalidationMemorySuggestion,
  RevalidationReport,
  RevalidationStatus
} from "./types";

interface RevalidationSubject {
  id: string;
  kind: RevalidationItemKind;
  ruleId: string;
  title: string;
  description: string;
  severity: RevalidationItem["severity"];
  file?: string | undefined;
  line?: number | undefined;
  snippet?: string | undefined;
}

const WEAK_TEST_RULE_IDS = new Set([
  "copied-implementation-in-test",
  "happy-path-only-test",
  "heavy-mocking",
  "mocked-changed-source",
  "snapshot-only-test",
  "test-bloat",
  "test-without-assertions",
  "unrelated-test-change"
]);

export function createRevalidationReport(input: RevalidationInput): RevalidationReport {
  const falsePositiveIds = new Set(input.falsePositiveIds ?? []);
  const acceptedRiskIds = new Set(input.acceptedRiskIds ?? []);
  const currentFiles = new Map((input.currentFiles ?? []).map((file) => [file.path, file.content]));
  const currentSubjects = toSubjects(input.currentReport);
  const previousSubjects = toSubjects(input.previousReport);
  const items = previousSubjects.map((subject) =>
    revalidateSubject({
      subject,
      currentSubjects,
      currentReport: input.currentReport,
      currentFiles,
      falsePositiveIds,
      acceptedRiskIds
    })
  );
  const memorySuggestions = createMemorySuggestions(items);

  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    previous: {
      generatedAt: input.previousReport.generatedAt,
      base: input.previousReport.base,
      head: input.previousReport.head
    },
    current: {
      generatedAt: input.currentReport.generatedAt,
      base: input.currentReport.base,
      head: input.currentReport.head
    },
    summary: {
      total: items.length,
      fixed: countStatus(items, "fixed"),
      "false-positive": countStatus(items, "false-positive"),
      confirmed: countStatus(items, "confirmed"),
      "accepted-risk": countStatus(items, "accepted-risk"),
      uncertain: countStatus(items, "uncertain"),
      memorySuggestions: memorySuggestions.length
    },
    items,
    memorySuggestions,
    safety: {
      deterministic: true,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false,
      notes: [
        "Revalidation compares a previous CodeDecay report with a fresh deterministic report.",
        "Explicit false-positive and accepted-risk marks come from user-provided ids.",
        "Memory suggestions are preview-only unless the CLI is run with --apply-memory."
      ]
    }
  };
}

export function revalidationSubjectId(input: {
  kind: RevalidationItemKind;
  ruleId: string;
  file?: string | undefined;
  line?: number | undefined;
}): string {
  return [
    input.kind,
    input.ruleId,
    input.file ?? "global",
    input.line === undefined ? "unknown-line" : String(input.line)
  ].join(":");
}

function revalidateSubject(input: {
  subject: RevalidationSubject;
  currentSubjects: RevalidationSubject[];
  currentReport: CodeDecayReport;
  currentFiles: Map<string, string | null>;
  falsePositiveIds: Set<string>;
  acceptedRiskIds: Set<string>;
}): RevalidationItem {
  const { subject } = input;

  if (input.falsePositiveIds.has(subject.id)) {
    return createItem(subject, "false-positive", ["Marked false-positive by explicit revalidation input."]);
  }

  if (input.acceptedRiskIds.has(subject.id)) {
    return createItem(subject, "accepted-risk", ["Marked accepted-risk by explicit revalidation input."]);
  }

  const currentMatch = findCurrentMatch(subject, input.currentSubjects);
  if (currentMatch) {
    return createItem(subject, "confirmed", [
      `The same ${subject.kind} still appears in the current deterministic report.`
    ]);
  }

  if (subject.file && currentFileIsUnsupported(subject, input.currentReport)) {
    return createItem(subject, "uncertain", [
      `${subject.file} was not fully analyzable in the current deterministic report.`
    ]);
  }

  if (subject.file && input.currentFiles.has(subject.file)) {
    const content = input.currentFiles.get(subject.file) ?? null;
    if (content === null) {
      return createItem(subject, "fixed", [`${subject.file} no longer exists in the current worktree.`]);
    }

    const snippet = normalizedSnippet(subject.snippet);
    if (snippet) {
      if (!content.includes(snippet)) {
        return createItem(subject, "fixed", ["The previous evidence snippet is no longer present."]);
      }

      return createItem(subject, "uncertain", [
        "The previous evidence snippet is still present, but the current deterministic report no longer raises this item."
      ]);
    }
  }

  if (WEAK_TEST_RULE_IDS.has(subject.ruleId)) {
    return createItem(subject, "fixed", ["The weak-test rule no longer fires in the current deterministic report."]);
  }

  return createItem(subject, "fixed", ["The item no longer appears in the current deterministic report."]);
}

function toSubjects(report: CodeDecayReport): RevalidationSubject[] {
  const findings = report.findings.map((finding) => subjectFromFinding(finding));
  const candidates = (report.securityCandidates ?? []).map((candidate) => subjectFromSecurityCandidate(candidate));
  return [...findings, ...candidates].sort((left, right) => left.id.localeCompare(right.id));
}

function subjectFromFinding(finding: Finding): RevalidationSubject {
  return {
    id: revalidationSubjectId({
      kind: "finding",
      ruleId: finding.ruleId,
      file: finding.file,
      line: finding.line
    }),
    kind: "finding",
    ruleId: finding.ruleId,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    file: finding.file,
    line: finding.line
  };
}

function subjectFromSecurityCandidate(candidate: SecurityCandidate): RevalidationSubject {
  return {
    id: revalidationSubjectId({
      kind: "security-candidate",
      ruleId: candidate.ruleId,
      file: candidate.file,
      line: candidate.line
    }),
    kind: "security-candidate",
    ruleId: candidate.ruleId,
    title: candidate.title,
    description: candidate.description,
    severity: candidate.severity,
    file: candidate.file,
    line: candidate.line,
    snippet: candidate.snippet
  };
}

function findCurrentMatch(subject: RevalidationSubject, currentSubjects: RevalidationSubject[]): RevalidationSubject | undefined {
  return currentSubjects.find((current) => {
    if (current.id === subject.id) {
      return true;
    }

    if (current.kind !== subject.kind || current.ruleId !== subject.ruleId || current.file !== subject.file) {
      return false;
    }

    const snippet = normalizedSnippet(subject.snippet);
    if (snippet && normalizedSnippet(current.snippet) === snippet) {
      return true;
    }

    return current.title === subject.title;
  });
}

function currentFileIsUnsupported(subject: RevalidationSubject, report: CodeDecayReport): boolean {
  if (!subject.file || !report.languageAnalysis) {
    return false;
  }

  const support = report.languageAnalysis.files.find((file) => file.path === subject.file);
  if (!support) {
    return false;
  }

  if (support.status === "unsupported") {
    return true;
  }

  return subject.kind === "security-candidate" && !support.capabilities.includes("security-matchers");
}

function createItem(subject: RevalidationSubject, status: RevalidationStatus, evidence: string[]): RevalidationItem {
  return {
    id: subject.id,
    kind: subject.kind,
    status,
    ruleId: subject.ruleId,
    title: subject.title,
    description: subject.description,
    severity: subject.severity,
    file: subject.file,
    line: subject.line,
    evidence
  };
}

function createMemorySuggestions(items: RevalidationItem[]): RevalidationMemorySuggestion[] {
  return items
    .filter((item) => (item.status === "confirmed" || item.status === "accepted-risk") && item.file)
    .map((item) => ({
      section: "regressions" as const,
      sourceItemId: item.id,
      title: `Revalidated ${item.status}: ${item.title}`,
      description: `${item.description} Evidence: ${item.evidence.join(" ")}`,
      severity: item.severity,
      files: item.file ? [item.file] : []
    }));
}

function countStatus(items: RevalidationItem[], status: RevalidationStatus): number {
  return items.filter((item) => item.status === status).length;
}

function normalizedSnippet(snippet: string | undefined): string | undefined {
  const normalized = snippet?.trim();
  return normalized ? normalized : undefined;
}
