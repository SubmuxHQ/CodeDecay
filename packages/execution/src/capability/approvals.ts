import { createHash, randomUUID } from "node:crypto";
import type { CapabilityKind } from "./types";

export interface CapabilityApprovalScope {
  capability: CapabilityKind;
  command?: string | undefined;
  paths?: string[] | undefined;
  hosts?: string[] | undefined;
  secrets?: string[] | undefined;
  /** MCP/tool confirmation scope — one approval cannot authorize unrelated tools. */
  toolName?: string | undefined;
}

export interface CapabilityApproval extends CapabilityApprovalScope {
  id: string;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  singleUse: boolean;
  consumed: boolean;
}

export interface CreateCapabilityApprovalInput extends CapabilityApprovalScope {
  sessionId: string;
  /** Absolute expiry. Defaults to now + ttlMs. */
  expiresAt?: string | undefined;
  /** Time-to-live in ms when expiresAt is omitted. Default 5 minutes. */
  ttlMs?: number | undefined;
  singleUse?: boolean | undefined;
  now?: Date | undefined;
}

const sessions = new Map<string, Map<string, CapabilityApproval>>();

export function createCapabilityApproval(input: CreateCapabilityApprovalInput): CapabilityApproval {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + ttlMs).toISOString();
  const approval: CapabilityApproval = {
    id: `cap-approval-${randomUUID()}`,
    sessionId: input.sessionId,
    capability: input.capability,
    command: input.command,
    paths: input.paths ? [...input.paths] : undefined,
    hosts: input.hosts ? [...input.hosts] : undefined,
    secrets: input.secrets ? [...input.secrets] : undefined,
    toolName: input.toolName,
    createdAt: now.toISOString(),
    expiresAt,
    singleUse: input.singleUse ?? true,
    consumed: false
  };

  const bucket = sessions.get(input.sessionId) ?? new Map<string, CapabilityApproval>();
  bucket.set(approval.id, approval);
  sessions.set(input.sessionId, bucket);
  return approval;
}

export function getCapabilityApproval(sessionId: string, approvalId: string): CapabilityApproval | undefined {
  return sessions.get(sessionId)?.get(approvalId);
}

export function clearCapabilityApprovalSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function resetCapabilityApprovalSessionsForTests(): void {
  sessions.clear();
}

export function validateCapabilityApproval(
  approval: CapabilityApproval,
  request: CapabilityApprovalScope & { now?: Date | undefined }
): { allowed: true } | { allowed: false; reason: string } {
  const now = request.now ?? new Date();
  if (approval.consumed) {
    return { allowed: false, reason: "capability approval already consumed" };
  }

  if (Date.parse(approval.expiresAt) <= now.getTime()) {
    return { allowed: false, reason: "capability approval expired" };
  }

  if (approval.capability !== request.capability) {
    return {
      allowed: false,
      reason: `capability approval is scoped to '${approval.capability}', not '${request.capability}'`
    };
  }

  if (approval.toolName && request.toolName && approval.toolName !== request.toolName) {
    return {
      allowed: false,
      reason: `capability approval is scoped to tool '${approval.toolName}', not '${request.toolName}'`
    };
  }

  if (approval.command !== undefined) {
    if (request.command === undefined || !commandsMatchExactly(approval.command, request.command)) {
      return { allowed: false, reason: "capability approval command scope mismatch" };
    }
  }

  if (approval.paths && !sameStringSet(approval.paths, request.paths ?? [])) {
    return { allowed: false, reason: "capability approval path scope mismatch" };
  }

  if (approval.hosts && !sameStringSet(approval.hosts.map(lower), (request.hosts ?? []).map(lower))) {
    return { allowed: false, reason: "capability approval host scope mismatch" };
  }

  if (approval.secrets && !sameStringSet(approval.secrets.map(upper), (request.secrets ?? []).map(upper))) {
    return { allowed: false, reason: "capability approval secret scope mismatch" };
  }

  return { allowed: true };
}

export function consumeCapabilityApproval(sessionId: string, approvalId: string, now?: Date): CapabilityApproval | undefined {
  const approval = getCapabilityApproval(sessionId, approvalId);
  if (!approval) {
    return undefined;
  }
  const check = validateCapabilityApproval(approval, {
    capability: approval.capability,
    command: approval.command,
    paths: approval.paths,
    hosts: approval.hosts,
    secrets: approval.secrets,
    toolName: approval.toolName,
    now
  });
  if (!check.allowed) {
    return undefined;
  }
  if (approval.singleUse) {
    approval.consumed = true;
  }
  return approval;
}

export function assertMcpConfirmationScope(
  approval: CapabilityApproval,
  toolName: string,
  capability: CapabilityKind
): { allowed: true } | { allowed: false; reason: string } {
  return validateCapabilityApproval(approval, {
    capability,
    toolName,
    command: approval.command,
    paths: approval.paths,
    hosts: approval.hosts,
    secrets: approval.secrets
  });
}

export function approvalFingerprint(scope: CapabilityApprovalScope): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        capability: scope.capability,
        command: scope.command ?? null,
        paths: [...(scope.paths ?? [])].sort(),
        hosts: [...(scope.hosts ?? [])].map(lower).sort(),
        secrets: [...(scope.secrets ?? [])].map(upper).sort(),
        toolName: scope.toolName ?? null
      })
    )
    .digest("hex");
}

function commandsMatchExactly(approved: string, requested: string): boolean {
  return approved.trim() === requested.trim();
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function lower(value: string): string {
  return value.toLowerCase();
}

function upper(value: string): string {
  return value.toUpperCase();
}
