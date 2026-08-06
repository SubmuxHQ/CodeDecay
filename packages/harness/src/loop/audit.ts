import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LoopReport, LoopRoundSnapshot, LoopStatus } from "./types";

export interface LoopAuditRoundRecord {
  schemaVersion: 1;
  runId: string;
  round: number;
  timestamp: string;
  statusHint?: LoopStatus | undefined;
  agentIdentity?: string | undefined;
  verifierIdentity?: string | undefined;
  evidenceIds: string[];
  commands: string[];
  changedPaths: string[];
  decisions: Array<{ phase: string; actor: string; summary: string }>;
  budgets: {
    modelCalls: number;
    wallTimeMs: number;
    fingerprintCount: number;
  };
  stopReason?: string | undefined;
}

export interface LoopAuditResumeState {
  runId: string;
  completedRounds: number;
  lastFingerprint?: string | undefined;
  stopReason?: string | undefined;
  modelCalls: number;
  records: LoopAuditRoundRecord[];
}

export function defaultLoopAuditPath(cwd: string, runId: string): string {
  return join(cwd, ".codedecay", "local", "loop-audit", `${runId}.jsonl`);
}

export function appendLoopAuditRecord(path: string, record: LoopAuditRoundRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

export function writeLoopAuditSummary(path: string, report: LoopReport): void {
  const summaryPath = path.endsWith(".jsonl") ? `${path.slice(0, -6)}.summary.json` : `${path}.summary.json`;
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: report.status,
        roundsRun: report.roundsRun,
        stopReason: report.stateMachine.decisions.at(-1)?.summary,
        generatedAt: report.generatedAt,
        verdict: report.verdict.status,
        roles: report.roles
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export function loadLoopAuditResumeState(path: string): LoopAuditResumeState | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const records: LoopAuditRoundRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as LoopAuditRoundRecord);
    } catch {
      // Ignore corrupt trailing lines; resume must stay deterministic and safe.
    }
  }
  if (records.length === 0) {
    return undefined;
  }
  const last = records[records.length - 1]!;
  return {
    runId: last.runId,
    completedRounds: records.length,
    lastFingerprint: undefined,
    stopReason: last.stopReason,
    modelCalls: last.budgets.modelCalls,
    records
  };
}

export function createAuditRecordFromRound(input: {
  runId: string;
  round: LoopRoundSnapshot;
  timestamp: string;
  modelCalls: number;
  wallTimeMs: number;
  fingerprintCount: number;
  stopReason?: string | undefined;
  statusHint?: LoopStatus | undefined;
}): LoopAuditRoundRecord {
  const commands = [
    input.round.builder?.command,
    input.round.verifier?.command,
    input.round.agent?.command
  ].filter((value): value is string => Boolean(value));
  const changedPaths = [
    ...(input.round.builder?.changedFiles ?? []),
    ...(input.round.verifier?.changedFiles ?? []),
    ...(input.round.agent?.changedFiles ?? [])
  ];
  const evidenceIds = input.round.stateMachine?.decisions.flatMap((decision) => decision.evidenceIds) ?? [];
  return {
    schemaVersion: 1,
    runId: input.runId,
    round: input.round.round,
    timestamp: input.timestamp,
    statusHint: input.statusHint,
    agentIdentity: input.round.builder?.identity ?? input.round.agent?.identity,
    verifierIdentity: input.round.verifier?.identity,
    evidenceIds,
    commands: [...new Set(commands)],
    changedPaths: [...new Set(changedPaths)],
    decisions: (input.round.stateMachine?.decisions ?? []).map((decision) => ({
      phase: decision.phase,
      actor: decision.actor,
      summary: decision.summary
    })),
    budgets: {
      modelCalls: input.modelCalls,
      wallTimeMs: input.wallTimeMs,
      fingerprintCount: input.fingerprintCount
    },
    stopReason: input.stopReason
  };
}
