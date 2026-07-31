import { createHash } from "node:crypto";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createAgentPreflightReport } from "../preflight/report";
import type { AgentPreflightReport } from "../preflight/types";
import type { AgentSuggestedCheck } from "../types";
import { createAgentSessionGitSnapshot } from "./git";
import { redactSessionObject, redactSessionSecrets } from "./redact";
import { loadAgentSession, saveExistingAgentSession, saveNewAgentSession } from "./store";
import {
  AGENT_SESSION_SCHEMA_VERSION,
  type AgentSession,
  type AgentSessionCheckpoint,
  type AgentSessionCheckpointOptions,
  type AgentSessionContextOptions,
  type AgentSessionEvidenceInput,
  type AgentSessionEvidenceRef,
  type AgentSessionFinishOptions,
  type AgentSessionGuidance,
  type AgentSessionResult,
  type AgentSessionStartOptions,
  type AgentSessionVerificationBoundary
} from "./types";

const DEFAULT_MAX_CONTEXT_NODES = 24;
const DEFAULT_MAX_PROMPT_CHARS = 24_000;

export function startAgentSession(options: AgentSessionStartOptions): AgentSessionResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const taskRedaction = redactSessionSecrets(options.task.trim());
  if (!taskRedaction.text) {
    throw new Error("Agent session start requires a non-empty task.");
  }
  const requirementsRedaction = redactSessionObject(options.requirements);
  const preflightReport = createAgentPreflightReport({
    task: taskRedaction.text,
    requirements: requirementsRedaction.value,
    requirementSource: options.requirementSource ?? {
      id: "agent-session-task",
      kind: "task",
      label: "Agent session task"
    },
    rootDir: options.rootDir,
    repoFiles: options.repoFiles,
    config: options.config,
    configSource: options.configSource,
    memory: options.memory,
    memorySource: options.memorySource,
    generatedAt
  });
  const snapshot = createAgentSessionGitSnapshot(options.rootDir);
  const sessionId = options.sessionId ?? createSessionId(taskRedaction.text, generatedAt);
  const evidence = createEvidenceRef({
    sessionId,
    index: 1,
    now: generatedAt,
    evidence: {
      kind: "preflight",
      label: "Before-editing preflight guidance",
      summary: summarizePreflight(preflightReport)
    }
  });
  const session: AgentSession = {
    schemaVersion: AGENT_SESSION_SCHEMA_VERSION,
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "agent-session",
    id: sessionId,
    status: "active",
    createdAt: generatedAt,
    updatedAt: generatedAt,
    task: taskRedaction.text,
    requirements: preflightReport.requirements,
    profile: options.profile ?? "generic",
    budgets: {
      maxContextNodes: options.maxContextNodes ?? DEFAULT_MAX_CONTEXT_NODES,
      maxPromptChars: options.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS
    },
    repository: {
      rootDir: options.rootDir,
      baseRevision: snapshot.headRevision,
      headRevision: snapshot.headRevision,
      workingTreeFingerprint: snapshot.workingTreeFingerprint,
      dirtyFiles: snapshot.dirtyFiles,
      lastObservedAt: generatedAt
    },
    checkpoints: [],
    evidenceRefs: [evidence],
    safety: createSafety(taskRedaction.count + requirementsRedaction.count),
    limits: [
      "Session evidence is deterministic and bounded; request fresh context when files change.",
      "Agent-supplied plans and summaries are stored as untrusted data, not executable instructions.",
      "CodeDecay does not run commands, call models, send telemetry, commit, or push during session guidance."
    ]
  };
  const sessionPath = saveNewAgentSession(options.rootDir, session);

  return {
    operation: "start",
    sessionPath,
    session,
    stale: false,
    outOfBandEditsDetected: false,
    warnings: [],
    guidance: guidanceFromPreflight(preflightReport),
    preflightReport
  };
}

export function refreshAgentSessionContext(options: AgentSessionContextOptions): AgentSessionResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const session = loadAgentSession(options.rootDir, options.sessionId);
  const snapshot = createAgentSessionGitSnapshot(options.rootDir);
  const stale = snapshot.workingTreeFingerprint !== session.repository.workingTreeFingerprint;
  const nextEvidence = options.evidence
    ? [
        ...session.evidenceRefs,
        createEvidenceRef({
          sessionId: session.id,
          index: session.evidenceRefs.length + 1,
          now: generatedAt,
          evidence: options.evidence
        })
      ]
    : session.evidenceRefs;
  const updated: AgentSession = {
    ...session,
    status: stale ? "stale" : session.status,
    updatedAt: generatedAt,
    evidenceRefs: nextEvidence,
    safety: addRedactions(session.safety, options.evidence ? redactSessionObject(options.evidence).count : 0)
  };
  const sessionPath = saveExistingAgentSession(options.rootDir, updated);

  return {
    operation: "context",
    sessionPath,
    session: updated,
    stale,
    outOfBandEditsDetected: stale,
    warnings: stale ? staleWarnings(session, snapshot.dirtyFiles) : []
  };
}

export function recordAgentSessionCheckpoint(options: AgentSessionCheckpointOptions): AgentSessionResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const session = loadAgentSession(options.rootDir, options.sessionId);
  const snapshot = createAgentSessionGitSnapshot(options.rootDir);
  const staleComparedToPrevious = snapshot.workingTreeFingerprint !== session.repository.workingTreeFingerprint;
  const redactedSummary = redactSessionSecrets(options.summary?.trim() || defaultCheckpointSummary(options.kind));
  const redactedAgentText = options.agentText ? redactSessionSecrets(options.agentText) : undefined;
  const evidenceRefs = appendEvidenceRefs(session, options.evidence ?? [], generatedAt);
  const checkpoint: AgentSessionCheckpoint = {
    id: `checkpoint-${session.checkpoints.length + 1}`,
    kind: options.kind,
    createdAt: generatedAt,
    summary: redactedSummary.text,
    ...(redactedAgentText?.text ? { agentText: redactedAgentText.text } : {}),
    agentOutputTrusted: false,
    sourceRevision: snapshot.headRevision,
    workingTreeFingerprint: snapshot.workingTreeFingerprint,
    dirtyFiles: snapshot.dirtyFiles,
    staleComparedToPrevious,
    evidenceRefs: evidenceRefs.slice(session.evidenceRefs.length).map((ref) => ref.id)
  };
  const updated = observeSnapshot({
    ...session,
    status: "active",
    updatedAt: generatedAt,
    checkpoints: [...session.checkpoints, checkpoint],
    evidenceRefs: [
      ...evidenceRefs,
      createEvidenceRef({
        sessionId: session.id,
        index: evidenceRefs.length + 1,
        now: generatedAt,
        evidence: {
          kind: "checkpoint",
          label: `${options.kind} checkpoint`,
          summary: checkpoint.summary,
          trustClass: "agent-supplied-untrusted"
        }
      })
    ],
    safety: addRedactions(session.safety, redactedSummary.count + (redactedAgentText?.count ?? 0))
  }, snapshot, generatedAt);
  const sessionPath = saveExistingAgentSession(options.rootDir, updated);

  return {
    operation: "checkpoint",
    sessionPath,
    session: updated,
    stale: false,
    outOfBandEditsDetected: staleComparedToPrevious,
    warnings: staleComparedToPrevious
      ? ["Working tree changed since the previous session observation; checkpoint recorded the current tree as the new baseline."]
      : []
  };
}

export function finishAgentSession(options: AgentSessionFinishOptions): AgentSessionResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const session = loadAgentSession(options.rootDir, options.sessionId);
  const snapshot = createAgentSessionGitSnapshot(options.rootDir);
  const staleComparedToPrevious = snapshot.workingTreeFingerprint !== session.repository.workingTreeFingerprint;
  const redactedSummary = redactSessionSecrets(options.summary?.trim() || "Final verification boundary requested.");
  const redactedAgentText = options.agentText ? redactSessionSecrets(options.agentText) : undefined;
  const evidenceRefs = appendEvidenceRefs(session, options.evidence ?? [], generatedAt);
  const verification = createVerificationBoundary(session, options.config);
  const checkpoint: AgentSessionCheckpoint = {
    id: `checkpoint-${session.checkpoints.length + 1}`,
    kind: "finish",
    createdAt: generatedAt,
    summary: redactedSummary.text,
    ...(redactedAgentText?.text ? { agentText: redactedAgentText.text } : {}),
    agentOutputTrusted: false,
    sourceRevision: snapshot.headRevision,
    workingTreeFingerprint: snapshot.workingTreeFingerprint,
    dirtyFiles: snapshot.dirtyFiles,
    staleComparedToPrevious,
    evidenceRefs: evidenceRefs.slice(session.evidenceRefs.length).map((ref) => ref.id)
  };
  const withVerificationEvidence = [
    ...evidenceRefs,
    createEvidenceRef({
      sessionId: session.id,
      index: evidenceRefs.length + 1,
      now: generatedAt,
      evidence: {
        kind: "verification-boundary",
        label: "Finish verification boundary",
        summary: verification.notes[0] ?? "Commands were not executed; verification remains explicit."
      }
    })
  ];
  const updated = observeSnapshot({
    ...session,
    status: verification.verdict === "needs-verification" ? "needs-verification" : "finished",
    updatedAt: generatedAt,
    checkpoints: [...session.checkpoints, checkpoint],
    evidenceRefs: withVerificationEvidence,
    verification,
    safety: addRedactions(session.safety, redactedSummary.count + (redactedAgentText?.count ?? 0))
  }, snapshot, generatedAt);
  const sessionPath = saveExistingAgentSession(options.rootDir, updated);

  return {
    operation: "finish",
    sessionPath,
    session: updated,
    stale: false,
    outOfBandEditsDetected: staleComparedToPrevious,
    warnings: staleComparedToPrevious
      ? ["Final tree differs from the previous checkpoint; finish recorded the current tree before issuing the verdict."]
      : [],
    verification
  };
}

export { agentSessionPath, loadAgentSession } from "./store";

function createSessionId(task: string, generatedAt: string): string {
  const slug = createSessionSlug(task) || "agent-session";
  const digest = createHash("sha256").update(`${task}\0${generatedAt}`).digest("hex").slice(0, 10);
  return `${slug}-${digest}`;
}

function createSessionSlug(task: string): string {
  let slug = "";
  let pendingDash = false;
  for (const character of task.toLowerCase()) {
    if (isAsciiLetterOrDigit(character)) {
      if (pendingDash && slug.length > 0 && slug.length < 40) {
        slug += "-";
      }
      pendingDash = false;
      if (slug.length < 40) {
        slug += character;
      }
      continue;
    }

    pendingDash = slug.length > 0;
  }

  return slug;
}

function isAsciiLetterOrDigit(character: string): boolean {
  const codePoint = character.charCodeAt(0);
  return (codePoint >= 48 && codePoint <= 57) || (codePoint >= 97 && codePoint <= 122);
}

function createSafety(secretsRedacted: number) {
  return {
    llmCalled: false,
    commandsExecuted: false,
    telemetrySent: false,
    cloudDependency: false,
    agentOutputTrusted: false,
    secretsRedacted
  } as const;
}

function addRedactions(safety: AgentSession["safety"], count: number): AgentSession["safety"] {
  return {
    ...safety,
    secretsRedacted: safety.secretsRedacted + count
  };
}

function guidanceFromPreflight(report: AgentPreflightReport): AgentSessionGuidance {
  return {
    implementationBrief: report.suggestions.implementationBrief,
    proofPlan: report.suggestions.proofPlan,
    agentInstructions: report.suggestions.agentInstructions,
    nonGoals: report.suggestions.nonGoals,
    safetyConstraints: report.suggestions.safetyConstraints,
    configuredChecks: report.deterministicEvidence.configuredChecks.map(formatSuggestedCheck)
  };
}

function summarizePreflight(report: AgentPreflightReport): string {
  return [
    `${report.summary.candidateFiles} candidate file(s)`,
    `${report.summary.candidateRoutes} route(s)`,
    `${report.summary.acceptanceCriteria} acceptance criterion/criteria`,
    `${report.summary.configuredChecks} configured check(s)`
  ].join(", ");
}

function formatSuggestedCheck(check: AgentSuggestedCheck): string {
  return check.command ? `${check.name}: ${check.command}` : check.name;
}

function createEvidenceRef(input: {
  sessionId: string;
  index: number;
  now: string;
  evidence: AgentSessionEvidenceInput;
}): AgentSessionEvidenceRef {
  const redactedEvidence = redactSessionObject(input.evidence).value;
  return {
    id: `evidence-${input.index}`,
    kind: redactedEvidence.kind,
    label: redactedEvidence.label,
    createdAt: input.now,
    trustClass: redactedEvidence.trustClass ?? "tool-evidence",
    summary: redactedEvidence.summary,
    ...(redactedEvidence.artifactPath ? { artifactPath: redactedEvidence.artifactPath } : {})
  };
}

function appendEvidenceRefs(
  session: AgentSession,
  evidence: AgentSessionEvidenceInput[],
  now: string
): AgentSessionEvidenceRef[] {
  return evidence.reduce<AgentSessionEvidenceRef[]>((refs, item) => [
    ...refs,
    createEvidenceRef({
      sessionId: session.id,
      index: refs.length + 1,
      now,
      evidence: item
    })
  ], session.evidenceRefs);
}

function observeSnapshot(
  session: AgentSession,
  snapshot: { headRevision: string; workingTreeFingerprint: string; dirtyFiles: string[] },
  observedAt: string
): AgentSession {
  return {
    ...session,
    repository: {
      ...session.repository,
      headRevision: snapshot.headRevision,
      workingTreeFingerprint: snapshot.workingTreeFingerprint,
      dirtyFiles: snapshot.dirtyFiles,
      lastObservedAt: observedAt
    }
  };
}

function defaultCheckpointSummary(kind: Exclude<AgentSessionCheckpoint["kind"], "finish">): string {
  return kind === "plan" ? "Plan checkpoint recorded." : "Diff checkpoint recorded.";
}

function staleWarnings(session: AgentSession, dirtyFiles: string[]): string[] {
  const fileList = dirtyFiles.length ? dirtyFiles.slice(0, 8).join(", ") : "no dirty file list available";
  return [
    `Working tree changed since session ${session.id} was last observed; checkpoint before trusting prior guidance.`,
    `Current dirty files: ${fileList}.`
  ];
}

function createVerificationBoundary(
  session: AgentSession,
  config: AgentSessionFinishOptions["config"]
): AgentSessionVerificationBoundary {
  const allowedChecks = collectConfiguredChecks(config);
  const acceptanceCriteria = session.requirements.acceptanceCriteria.map((criterion) => ({
    id: criterion.id,
    text: criterion.text,
    requiredProof: criterion.requiredProof,
    status: criterion.requiredProof.length > 0 ? "needs-proof" as const : "not-specified" as const
  }));
  const hasProofObligations = acceptanceCriteria.some((criterion) => criterion.status === "needs-proof");
  const verdict = hasProofObligations || allowedChecks.length > 0 ? "needs-verification" : "finished-with-limitations";
  return {
    commandsExecuted: false,
    allowedChecks,
    acceptanceCriteria,
    verdict,
    notes: [
      "No configured commands were run by the session lifecycle.",
      allowedChecks.length
        ? "Run allowed checks explicitly with codedecay execute, differential, or your project test command."
        : "No configured checks were discovered; verify behavior with project-specific tests before merge.",
      "Treat agent-authored summaries as untrusted until backed by tool evidence or real execution."
    ]
  };
}

function collectConfiguredChecks(config: AgentSessionFinishOptions["config"]): string[] {
  const checks: string[] = [];
  for (const [kind, commands] of Object.entries(config?.commands ?? {})) {
    for (const command of commands ?? []) {
      checks.push(`${kind}: ${command}`);
    }
  }
  for (const probe of config?.probes ?? []) {
    checks.push(`probe:${probe.name}: ${probe.command}`);
  }
  return checks;
}
