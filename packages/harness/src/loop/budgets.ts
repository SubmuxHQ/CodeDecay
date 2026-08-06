import type { FileChange } from "@submuxhq/codedecay-core";
import type { LoopStatus } from "./types";

export interface LoopBudgetConfig {
  maxWallTimeMs?: number | undefined;
  maxChangedFiles?: number | undefined;
  allowedPathPrefixes?: string[] | undefined;
  protectedPathPrefixes?: string[] | undefined;
  maxModelCalls?: number | undefined;
}

export interface LoopBudgetState {
  startedAtMs: number;
  modelCalls: number;
  fingerprints: string[];
}

export interface LoopBudgetViolation {
  status: Extract<LoopStatus, "budget-exhausted" | "unsafe-change" | "stuck">;
  reason: string;
}

export function createLoopBudgetState(nowMs: number): LoopBudgetState {
  return {
    startedAtMs: nowMs,
    modelCalls: 0,
    fingerprints: []
  };
}

export function checkWallTimeBudget(
  config: LoopBudgetConfig,
  state: LoopBudgetState,
  nowMs: number
): LoopBudgetViolation | undefined {
  if (config.maxWallTimeMs === undefined) {
    return undefined;
  }
  if (nowMs - state.startedAtMs <= config.maxWallTimeMs) {
    return undefined;
  }
  return {
    status: "budget-exhausted",
    reason: `Wall-time budget exhausted after ${nowMs - state.startedAtMs}ms (limit ${config.maxWallTimeMs}ms).`
  };
}

export function checkModelCallBudget(
  config: LoopBudgetConfig,
  state: LoopBudgetState
): LoopBudgetViolation | undefined {
  if (config.maxModelCalls === undefined) {
    return undefined;
  }
  if (state.modelCalls < config.maxModelCalls) {
    return undefined;
  }
  return {
    status: "budget-exhausted",
    reason: `Model-call budget exhausted after ${state.modelCalls} call(s) (limit ${config.maxModelCalls}).`
  };
}

export function checkChangedFileBudgets(
  config: LoopBudgetConfig,
  changedFiles: FileChange[]
): LoopBudgetViolation | undefined {
  const paths = changedFiles.map((file) => file.path);

  if (config.maxChangedFiles !== undefined && paths.length > config.maxChangedFiles) {
    return {
      status: "budget-exhausted",
      reason: `Changed-file budget exceeded: ${paths.length} file(s) (limit ${config.maxChangedFiles}).`
    };
  }

  if (config.protectedPathPrefixes && config.protectedPathPrefixes.length > 0) {
    const protectedHit = paths.find((path) =>
      config.protectedPathPrefixes!.some((prefix) => pathEqualsOrUnder(path, prefix))
    );
    if (protectedHit) {
      return {
        status: "unsafe-change",
        reason: `Protected path edited: ${protectedHit}.`
      };
    }
  }

  if (config.allowedPathPrefixes && config.allowedPathPrefixes.length > 0) {
    const outOfScope = paths.find(
      (path) => !config.allowedPathPrefixes!.some((prefix) => pathEqualsOrUnder(path, prefix))
    );
    if (outOfScope) {
      return {
        status: "unsafe-change",
        reason: `Changed path outside allowed scope: ${outOfScope}.`
      };
    }
  }

  return undefined;
}

export function detectOscillation(
  state: LoopBudgetState,
  fingerprint: string
): LoopBudgetViolation | undefined {
  const priorMatches = state.fingerprints.filter((value) => value === fingerprint).length;
  state.fingerprints.push(fingerprint);
  if (priorMatches >= 1 && state.fingerprints.length >= 3) {
    return {
      status: "stuck",
      reason: "Oscillation detected: repeated changed-tree fingerprint with no durable progress."
    };
  }
  return undefined;
}

export function detectWideningScope(
  previousPaths: string[],
  currentPaths: string[]
): LoopBudgetViolation | undefined {
  if (previousPaths.length === 0) {
    return undefined;
  }
  const previous = new Set(previousPaths);
  const added = currentPaths.filter((path) => !previous.has(path));
  if (added.length >= 3 && currentPaths.length > previousPaths.length + 2) {
    return {
      status: "stuck",
      reason: `Scope widened unexpectedly by ${added.length} new path(s).`
    };
  }
  return undefined;
}

function pathEqualsOrUnder(path: string, prefix: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedPrefix = prefix.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}
