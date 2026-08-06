import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CapabilityAuditEvent, CapabilityAuditPhase, CapabilityKind, CapabilityIntentSource } from "./types";

export const CAPABILITY_AUDIT_RELATIVE_PATH = join(".codedecay", "local", "capability-audit.jsonl");

export interface AppendCapabilityAuditOptions {
  cwd: string;
  phase: CapabilityAuditPhase;
  capability: CapabilityKind;
  intentSource: CapabilityIntentSource;
  decision: "allow" | "deny";
  reason: string;
  command?: string | undefined;
  paths?: string[] | undefined;
  durationMs?: number | undefined;
  status?: string | undefined;
  id?: string | undefined;
  at?: string | undefined;
}

export function resolveCapabilityAuditPath(cwd: string): string {
  return join(cwd, CAPABILITY_AUDIT_RELATIVE_PATH);
}

export function appendCapabilityAuditEvent(options: AppendCapabilityAuditOptions): CapabilityAuditEvent {
  const event: CapabilityAuditEvent = {
    id: options.id ?? randomUUID(),
    at: options.at ?? new Date().toISOString(),
    phase: options.phase,
    capability: options.capability,
    intentSource: options.intentSource,
    decision: options.decision,
    reason: options.reason
  };

  if (options.command !== undefined) {
    event.command = options.command;
  }

  if (options.paths !== undefined) {
    event.paths = [...options.paths];
  }

  if (options.durationMs !== undefined) {
    event.durationMs = options.durationMs;
  }

  if (options.status !== undefined) {
    event.status = options.status;
  }

  const auditPath = resolveCapabilityAuditPath(options.cwd);
  mkdirSync(dirname(auditPath), { recursive: true });
  appendFileSync(auditPath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}
