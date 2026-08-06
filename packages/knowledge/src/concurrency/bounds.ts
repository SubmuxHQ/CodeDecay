import {
  CONCURRENCY_DEFAULT_BOUNDS,
  type ConcurrencyBounds,
  type ConcurrencyTargetKind
} from "./types";

export interface BoundsGateResult {
  blocked: boolean;
  reasons: string[];
  effective: ConcurrencyBounds;
}

export function gateConcurrencyBounds(bounds: ConcurrencyBounds): BoundsGateResult {
  const reasons: string[] = [];
  const effective: ConcurrencyBounds = {
    maxParallelism: bounds.maxParallelism,
    repetitions: bounds.repetitions,
    timeoutMs: bounds.timeoutMs,
    targetKind: bounds.targetKind,
    networkTarget: bounds.networkTarget
  };

  if (bounds.maxParallelism < 1 || bounds.maxParallelism > CONCURRENCY_DEFAULT_BOUNDS.maxParallelism) {
    reasons.push(
      `maxParallelism ${bounds.maxParallelism} is outside configured bound 1..${CONCURRENCY_DEFAULT_BOUNDS.maxParallelism}.`
    );
  }
  if (bounds.repetitions < 1 || bounds.repetitions > CONCURRENCY_DEFAULT_BOUNDS.repetitions) {
    reasons.push(
      `repetitions ${bounds.repetitions} is outside configured bound 1..${CONCURRENCY_DEFAULT_BOUNDS.repetitions}.`
    );
  }
  if (bounds.timeoutMs < 1 || bounds.timeoutMs > CONCURRENCY_DEFAULT_BOUNDS.timeoutMs) {
    reasons.push(
      `timeoutMs ${bounds.timeoutMs} is outside configured bound 1..${CONCURRENCY_DEFAULT_BOUNDS.timeoutMs}.`
    );
  }
  if (!isAllowedTarget(bounds.targetKind)) {
    reasons.push(`Target kind "${bounds.targetKind}" is not allowed for concurrency experiments.`);
  }
  if (bounds.networkTarget && !isLocalNetworkTarget(bounds.networkTarget)) {
    reasons.push(`Network target "${bounds.networkTarget}" is blocked; only fixture-local / localhost disposable targets are allowed.`);
  }

  return { blocked: reasons.length > 0, reasons, effective };
}

function isAllowedTarget(kind: ConcurrencyTargetKind): boolean {
  return kind === "fixture-local" || kind === "disposable-local";
}

function isLocalNetworkTarget(target: string): boolean {
  const normalized = target.trim().toLowerCase();
  return (
    normalized === "fixture-local" ||
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("http://127.0.0.1") ||
    normalized.startsWith("http://localhost")
  );
}
