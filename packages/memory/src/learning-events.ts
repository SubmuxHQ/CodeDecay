import { createHash } from "node:crypto";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { firstMatchingFile } from "./context-matchers";
import {
  normalizeArray,
  normalizeObject,
  optionalString,
  optionalStringArray,
  requiredString
} from "./schema-primitives";
import type {
  CodeDecayMemory,
  MemoryLearningAuditEntry,
  MemoryLearningEvent,
  MemoryLearningEventInput,
  MemoryLearningEventKind,
  MemoryLearningOperationInput,
  MemoryLearningRetrievalEntry,
  MemoryLearningRetrievalInput,
  MemoryLearningRetrievalResult,
  MemoryLearningReviewStatus,
  MemoryLearningScope,
  MemoryLearningTrustClass
} from "./types";

const EVENT_KINDS = new Set<MemoryLearningEventKind>([
  "confirmed-regression",
  "verified-repair",
  "refuted-hypothesis",
  "accepted-risk",
  "incident",
  "architecture-decision",
  "convention",
  "ownership-change",
  "proof-recipe"
]);

const TRUST_CLASSES = new Set<MemoryLearningTrustClass>([
  "tool-evidence",
  "runtime-evidence",
  "human-approved",
  "agent-proposal-untrusted",
  "pr-text-untrusted",
  "external-memory-untrusted"
]);

const REVIEW_STATUSES = new Set<MemoryLearningReviewStatus>([
  "proposed",
  "approved",
  "rejected",
  "superseded",
  "expired",
  "revoked"
]);

const SECRET_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:sk|ghp|github_pat|glpat|xox[baprs])_[A-Za-z0-9_=-]{8,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+/gi
];

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?previous\s+instructions/gi,
  /system\s*prompt/gi,
  /run\s+(?:this\s+)?command\s*[:=]/gi,
  /rm\s+-rf/gi
];

export function createLearningEventProposal(input: MemoryLearningEventInput): MemoryLearningEvent {
  const createdAt = normalizeTimestamp(input.timestamp, "timestamp");
  const sourceEvidenceIds = dedupeStrings(input.sourceEvidenceIds.map((id) => id.trim()).filter(Boolean));
  if (sourceEvidenceIds.length === 0) {
    throw new Error("Learning event proposal must cite at least one source evidence id.");
  }

  const scope = normalizeScope(input.scope ?? {});
  const event: MemoryLearningEvent = {
    id: createEventId(input, sourceEvidenceIds),
    schemaVersion: 1,
    kind: normalizeKind(input.kind),
    title: redactLearningText(input.title),
    summary: redactLearningText(input.summary),
    invariant: input.invariant ? redactLearningText(input.invariant) : undefined,
    proofRecipe: input.proofRecipe ? redactLearningText(input.proofRecipe) : undefined,
    sourceEvidenceIds,
    scope,
    confidence: clampConfidence(input.confidence ?? confidenceForTrust(input.trustClass)),
    trustClass: normalizeTrustClass(input.trustClass),
    creator: redactLearningText(input.creator),
    createdAt,
    reviewStatus: "proposed",
    reviewDueAt: input.reviewDueAt ? normalizeTimestamp(input.reviewDueAt, "reviewDueAt") : undefined,
    supersedes: input.supersedes ? dedupeStrings(input.supersedes) : undefined,
    expiresAt: input.expiresAt ? normalizeTimestamp(input.expiresAt, "expiresAt") : undefined,
    auditTrail: [
      {
        action: "propose",
        actor: redactLearningText(input.creator),
        timestamp: createdAt,
        reason: "Created as a reviewable learning proposal; durable memory requires explicit approval.",
        evidenceIds: sourceEvidenceIds
      }
    ]
  };

  return event;
}

export function applyLearningEventOperation(
  memory: CodeDecayMemory,
  operation: MemoryLearningOperationInput
): CodeDecayMemory {
  const timestamp = normalizeTimestamp(operation.timestamp, "timestamp");
  const updatedEvents = learningEvents(memory).map((event) => {
    if (event.id !== operation.eventId) {
      return event;
    }

    const nextStatus = statusForOperation(operation.action);
    const auditEntry: MemoryLearningAuditEntry = {
      action: operation.action,
      actor: redactLearningText(operation.actor),
      timestamp,
      reason: redactLearningText(operation.reason),
      evidenceIds: operation.evidenceIds ? dedupeStrings(operation.evidenceIds) : undefined
    };

    return {
      ...event,
      reviewStatus: nextStatus,
      trustClass: nextStatus === "approved" ? "human-approved" : event.trustClass,
      auditTrail: [...event.auditTrail, auditEntry]
    };
  });

  if (updatedEvents.every((event) => event.id !== operation.eventId)) {
    throw new Error(`Learning event not found: ${operation.eventId}`);
  }

  return { ...memory, learningEvents: updatedEvents };
}

export function retrieveApprovedLearningEvents(input: MemoryLearningRetrievalInput): MemoryLearningRetrievalResult {
  const now = input.now ? Date.parse(input.now) : Date.now();
  const included: MemoryLearningRetrievalEntry[] = [];
  const suppressed: MemoryLearningRetrievalEntry[] = [];
  const approvedSuperseders = new Set(
    learningEvents(input.memory)
      .filter((event) => event.reviewStatus === "approved")
      .flatMap((event) => event.supersedes ?? [])
  );

  for (const event of learningEvents(input.memory)) {
    const suppression = suppressionReason(event, input, now, approvedSuperseders);
    if (suppression) {
      suppressed.push({ event, reason: suppression });
      continue;
    }

    included.push({
      event,
      reason: inclusionReason(event, input)
    });
  }

  return { included, suppressed };
}

export function normalizeLearningEvent(value: unknown, index: number, sourcePath: string): MemoryLearningEvent {
  const field = `learningEvents[${index}]`;
  const object = normalizeObject(value, sourcePath, field);
  const schemaVersion = object.schemaVersion;
  if (schemaVersion !== 1) {
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field}.schemaVersion must be 1.`);
  }

  const auditTrail = normalizeArray(object.auditTrail, sourcePath, `${field}.auditTrail`).map((entry, auditIndex) =>
    normalizeAuditEntry(entry, sourcePath, `${field}.auditTrail[${auditIndex}]`)
  );

  return {
    id: requiredString(object.id, sourcePath, `${field}.id`),
    schemaVersion: 1,
    kind: normalizeKind(requiredString(object.kind, sourcePath, `${field}.kind`)),
    title: redactLearningText(requiredString(object.title, sourcePath, `${field}.title`)),
    summary: redactLearningText(requiredString(object.summary, sourcePath, `${field}.summary`)),
    invariant: redactOptionalString(object.invariant, sourcePath, `${field}.invariant`),
    proofRecipe: redactOptionalString(object.proofRecipe, sourcePath, `${field}.proofRecipe`),
    sourceEvidenceIds: normalizeStringList(object.sourceEvidenceIds, sourcePath, `${field}.sourceEvidenceIds`),
    scope: normalizeScope(normalizeObject(object.scope, sourcePath, `${field}.scope`)),
    confidence: clampConfidence(numberField(object.confidence, sourcePath, `${field}.confidence`)),
    trustClass: normalizeTrustClass(requiredString(object.trustClass, sourcePath, `${field}.trustClass`)),
    creator: redactLearningText(requiredString(object.creator, sourcePath, `${field}.creator`)),
    createdAt: normalizeTimestamp(requiredString(object.createdAt, sourcePath, `${field}.createdAt`), `${field}.createdAt`),
    reviewStatus: normalizeReviewStatus(requiredString(object.reviewStatus, sourcePath, `${field}.reviewStatus`)),
    reviewDueAt: optionalTimestamp(object.reviewDueAt, `${field}.reviewDueAt`),
    supersedes: optionalStringArray(object.supersedes, sourcePath, `${field}.supersedes`),
    expiresAt: optionalTimestamp(object.expiresAt, `${field}.expiresAt`),
    auditTrail
  };
}

export function redactLearningText(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    redacted = redacted.replace(pattern, "[UNTRUSTED-INSTRUCTION]");
  }
  return redacted;
}

function suppressionReason(
  event: MemoryLearningEvent,
  input: MemoryLearningRetrievalInput,
  now: number,
  approvedSuperseders: Set<string>
): string | undefined {
  if (event.reviewStatus !== "approved") {
    return `suppressed because review status is ${event.reviewStatus}`;
  }
  if (event.expiresAt && Date.parse(event.expiresAt) <= now) {
    return "suppressed because the learning expired";
  }
  if (approvedSuperseders.has(event.id)) {
    return "suppressed because a newer approved learning supersedes it";
  }
  if (event.scope.repository && input.repository && event.scope.repository !== input.repository) {
    return `suppressed because repository scope ${event.scope.repository} does not match ${input.repository}`;
  }
  if (!firstMatchingFile(event.scope, input.changedFiles, input.impactedAreas)) {
    return "suppressed because no changed file or impacted area matched the learning scope";
  }
  return undefined;
}

function inclusionReason(event: MemoryLearningEvent, input: MemoryLearningRetrievalInput): string {
  const match = firstMatchingFile(event.scope, input.changedFiles, input.impactedAreas);
  const revision = event.scope.revision ? ` at ${event.scope.revision}` : "";
  return `included approved ${event.kind}${revision} for ${match?.path ?? "matched impact scope"}`;
}

function normalizeAuditEntry(value: unknown, sourcePath: string, field: string): MemoryLearningAuditEntry {
  const object = normalizeObject(value, sourcePath, field);
  const action = requiredString(object.action, sourcePath, `${field}.action`);
  if (!["propose", "approve", "reject", "supersede", "expire", "revoke"].includes(action)) {
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field}.action is invalid.`);
  }

  return {
    action: action as MemoryLearningAuditEntry["action"],
    actor: redactLearningText(requiredString(object.actor, sourcePath, `${field}.actor`)),
    timestamp: normalizeTimestamp(requiredString(object.timestamp, sourcePath, `${field}.timestamp`), `${field}.timestamp`),
    reason: redactLearningText(requiredString(object.reason, sourcePath, `${field}.reason`)),
    evidenceIds: optionalStringArray(object.evidenceIds, sourcePath, `${field}.evidenceIds`)
  };
}

function normalizeScope(scope: MemoryLearningScope | Record<string, unknown>): MemoryLearningScope {
  return {
    repository: typeof scope.repository === "string" ? scope.repository : undefined,
    revision: typeof scope.revision === "string" ? scope.revision : undefined,
    files: Array.isArray(scope.files) ? scope.files.filter((item): item is string => typeof item === "string") : undefined,
    areas: Array.isArray(scope.areas)
      ? (scope.areas.filter((item) => typeof item === "string") as MemoryLearningScope["areas"])
      : undefined,
    productPaths: Array.isArray(scope.productPaths) ? scope.productPaths.filter((item): item is string => typeof item === "string") : undefined,
    symbols: Array.isArray(scope.symbols) ? scope.symbols.filter((item): item is string => typeof item === "string") : undefined
  };
}

function learningEvents(memory: CodeDecayMemory): MemoryLearningEvent[] {
  return memory.learningEvents ?? [];
}

function createEventId(input: MemoryLearningEventInput, evidenceIds: string[]): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([input.kind, input.title, input.scope ?? {}, evidenceIds]))
    .digest("hex")
    .slice(0, 16);
  return `learn_${hash}`;
}

function statusForOperation(action: MemoryLearningOperationInput["action"]): MemoryLearningReviewStatus {
  switch (action) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "supersede":
      return "superseded";
    case "expire":
      return "expired";
    case "revoke":
      return "revoked";
  }
}

function normalizeKind(value: string): MemoryLearningEventKind {
  if (EVENT_KINDS.has(value as MemoryLearningEventKind)) {
    return value as MemoryLearningEventKind;
  }
  throw new Error(`Invalid learning event kind: ${value}`);
}

function normalizeTrustClass(value: string): MemoryLearningTrustClass {
  if (TRUST_CLASSES.has(value as MemoryLearningTrustClass)) {
    return value as MemoryLearningTrustClass;
  }
  throw new Error(`Invalid learning trust class: ${value}`);
}

function normalizeReviewStatus(value: string): MemoryLearningReviewStatus {
  if (REVIEW_STATUSES.has(value as MemoryLearningReviewStatus)) {
    return value as MemoryLearningReviewStatus;
  }
  throw new Error(`Invalid learning review status: ${value}`);
}

function confidenceForTrust(trustClass: MemoryLearningTrustClass): number {
  return trustClass === "tool-evidence" || trustClass === "runtime-evidence" ? 0.75 : 0.25;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function numberField(value: unknown, sourcePath: string, field: string): number {
  if (typeof value === "number") {
    return value;
  }
  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a number.`);
}

function normalizeStringList(value: unknown, sourcePath: string, field: string): string[] {
  const items = optionalStringArray(value, sourcePath, field) ?? [];
  return dedupeStrings(items.map((item) => item.trim()).filter(Boolean));
}

function redactOptionalString(value: unknown, sourcePath: string, field: string): string | undefined {
  const text = optionalString(value, sourcePath, field);
  return text ? redactLearningText(text) : undefined;
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return normalizeTimestamp(value, field);
}

function normalizeTimestamp(value: string, field: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return new Date(timestamp).toISOString();
}
