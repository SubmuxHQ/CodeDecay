import { RESILIENCE_DEFAULT_BOUNDS, type ResilienceBounds, type ResilienceTargetKind } from "./types";

export function gateResilienceBounds(bounds: ResilienceBounds): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (bounds.maxRetries < 0 || bounds.maxRetries > RESILIENCE_DEFAULT_BOUNDS.maxRetries) {
    reasons.push(`maxRetries ${bounds.maxRetries} outside 0..${RESILIENCE_DEFAULT_BOUNDS.maxRetries}.`);
  }
  if (bounds.maxRequests < 1 || bounds.maxRequests > RESILIENCE_DEFAULT_BOUNDS.maxRequests) {
    reasons.push(`maxRequests ${bounds.maxRequests} outside 1..${RESILIENCE_DEFAULT_BOUNDS.maxRequests}.`);
  }
  if (bounds.timeoutMs < 1 || bounds.timeoutMs > RESILIENCE_DEFAULT_BOUNDS.timeoutMs) {
    reasons.push(`timeoutMs ${bounds.timeoutMs} outside 1..${RESILIENCE_DEFAULT_BOUNDS.timeoutMs}.`);
  }
  if (bounds.maxFaultDurationMs < 1 || bounds.maxFaultDurationMs > RESILIENCE_DEFAULT_BOUNDS.maxFaultDurationMs) {
    reasons.push(
      `maxFaultDurationMs ${bounds.maxFaultDurationMs} outside 1..${RESILIENCE_DEFAULT_BOUNDS.maxFaultDurationMs}.`
    );
  }
  if (bounds.targetKind !== "fixture-local" && bounds.targetKind !== "disposable-local") {
    reasons.push(`Target kind "${bounds.targetKind}" is blocked for resilience experiments.`);
  }
  return { blocked: reasons.length > 0, reasons };
}

export function isProductionLikeTarget(kind: ResilienceTargetKind): boolean {
  return kind === "production-like" || kind === "remote-unapproved";
}
