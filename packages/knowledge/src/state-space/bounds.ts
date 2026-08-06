import {
  STATE_SPACE_DEFAULT_BOUNDS,
  type StateSpaceBounds,
  type StateSpaceTargetKind
} from "./types";

export interface StateSpaceBoundsGate {
  blocked: boolean;
  reasons: string[];
  effective: StateSpaceBounds;
}

export function gateStateSpaceBounds(
  bounds: StateSpaceBounds,
  dimensionCount: number,
  combinationCount: number
): StateSpaceBoundsGate {
  const reasons: string[] = [];
  if (bounds.maxDimensions < 1 || bounds.maxDimensions > STATE_SPACE_DEFAULT_BOUNDS.maxDimensions) {
    reasons.push(
      `maxDimensions ${bounds.maxDimensions} is outside configured bound 1..${STATE_SPACE_DEFAULT_BOUNDS.maxDimensions}.`
    );
  }
  if (bounds.maxCombinations < 1 || bounds.maxCombinations > STATE_SPACE_DEFAULT_BOUNDS.maxCombinations) {
    reasons.push(
      `maxCombinations ${bounds.maxCombinations} is outside configured bound 1..${STATE_SPACE_DEFAULT_BOUNDS.maxCombinations}.`
    );
  }
  if (bounds.timeoutMs < 1 || bounds.timeoutMs > STATE_SPACE_DEFAULT_BOUNDS.timeoutMs) {
    reasons.push(
      `timeoutMs ${bounds.timeoutMs} is outside configured bound 1..${STATE_SPACE_DEFAULT_BOUNDS.timeoutMs}.`
    );
  }
  if (!isAllowedTarget(bounds.targetKind)) {
    reasons.push(`Target kind "${bounds.targetKind}" is not allowed for state-space experiments.`);
  }
  if (dimensionCount > bounds.maxDimensions) {
    reasons.push(`Dimension count ${dimensionCount} exceeds maxDimensions ${bounds.maxDimensions}.`);
  }
  if (combinationCount > bounds.maxCombinations) {
    reasons.push(`Combination count ${combinationCount} exceeds maxCombinations ${bounds.maxCombinations}.`);
  }
  return { blocked: reasons.length > 0, reasons, effective: { ...bounds } };
}

function isAllowedTarget(kind: StateSpaceTargetKind): boolean {
  return kind === "fixture-local" || kind === "disposable-local";
}
