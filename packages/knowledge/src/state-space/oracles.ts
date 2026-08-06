import type {
  StateSpaceCombination,
  StateSpaceDimension,
  StateSpaceExperimentInput
} from "./types";

/** Deterministic pairwise-ish generator: cover each adjacent dimension pair, then prune to maxCombinations. */
export function generateStateSpaceCombinations(
  dimensions: StateSpaceDimension[],
  seed: number,
  maxCombinations: number,
  explicit?: StateSpaceCombination[]
): StateSpaceCombination[] {
  if (explicit?.length) {
    return explicit.map((item, index) => ({
      ...item,
      selected: index < maxCombinations,
      exclusionReason: index < maxCombinations ? undefined : "Pruned by maxCombinations bound."
    }));
  }

  if (!dimensions.length) return [];

  const pairs: StateSpaceCombination[] = [];
  for (let i = 0; i < dimensions.length; i += 1) {
    for (let j = i + 1; j < dimensions.length; j += 1) {
      const left = dimensions[i]!;
      const right = dimensions[j]!;
      for (const lv of left.values) {
        for (const rv of right.values) {
          const values: Record<string, string> = {};
          for (const dim of dimensions) {
            if (dim.id === left.id) values[dim.id] = lv;
            else if (dim.id === right.id) values[dim.id] = rv;
            else values[dim.id] = dim.values[seed % dim.values.length]!;
          }
          pairs.push({
            id: `pair:${left.id}=${lv}|${right.id}=${rv}`,
            values,
            selected: true
          });
        }
      }
    }
  }

  // Also include the all-defaults row.
  const defaults: Record<string, string> = {};
  for (const dim of dimensions) defaults[dim.id] = dim.values[0]!;
  pairs.unshift({ id: "defaults", values: defaults, selected: true });

  const deduped = dedupe(pairs);
  return deduped.map((item, index) => ({
    ...item,
    selected: index < maxCombinations,
    exclusionReason: index < maxCombinations ? undefined : "Pruned by maxCombinations bound; coverage is not exhaustive."
  }));
}

function dedupe(items: StateSpaceCombination[]): StateSpaceCombination[] {
  const seen = new Set<string>();
  const out: StateSpaceCombination[] = [];
  for (const item of items) {
    const key = JSON.stringify(item.values);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function evaluateStateSpaceOracle(
  experiment: StateSpaceExperimentInput,
  combinations: StateSpaceCombination[]
): {
  verdict: import("./types").StateSpaceVerdict;
  combinationResults: import("./types").StateSpaceCombinationResult[];
  failures: string[];
} {
  const failures: string[] = [];
  const combinationResults: import("./types").StateSpaceCombinationResult[] = [];
  const selected = combinations.filter((item) => item.selected);

  for (const combination of combinations) {
    if (!combination.selected) {
      combinationResults.push({
        combinationId: combination.id,
        values: combination.values,
        status: "untested",
        detail: combination.exclusionReason ?? "Not selected."
      });
      continue;
    }

    const result = evaluateOne(experiment, combination);
    combinationResults.push(result);
    if (result.status === "failed") failures.push(`${combination.id}: ${result.detail}`);
  }

  if (experiment.remoteFlagProvider?.contacted && !experiment.remoteFlagProvider.configured) {
    return {
      verdict: "provider-blocked",
      combinationResults,
      failures: ["Remote flag provider was contacted without explicit configuration."]
    };
  }

  const failed = combinationResults.filter((item) => item.status === "failed");
  if (!selected.length) {
    return { verdict: "insufficient-state-model", combinationResults, failures: ["No combinations were selected."] };
  }
  if (failed.length) {
    return { verdict: "confirmed-regression", combinationResults, failures };
  }
  return { verdict: "passed-oracle", combinationResults, failures };
}

function evaluateOne(
  experiment: StateSpaceExperimentInput,
  combination: StateSpaceCombination
): import("./types").StateSpaceCombinationResult {
  const mode = experiment.implementation.mode;
  const cacheState = combination.values.cache ?? combination.values["cache-state"];
  const flags = Object.entries(combination.values).filter(([key]) => key.startsWith("flag:") || key.includes("flag"));

  if (mode === "stale-cache") {
    const writeValue = experiment.implementation.writeValue ?? "new";
    const cachedValue = experiment.implementation.cachedValue ?? "old";
    if (cacheState === "warm" || cacheState === "stale") {
      const read = cachedValue;
      if (experiment.oracle.expectedReadValue && read !== experiment.oracle.expectedReadValue) {
        return {
          combinationId: combination.id,
          values: combination.values,
          status: "failed",
          detail: `Stale cache read returned "${read}" after write "${writeValue}" under ${cacheState} state.`
        };
      }
    }
    if (cacheState === "cold" || cacheState === "invalidated" || cacheState === "missing") {
      return {
        combinationId: combination.id,
        values: combination.values,
        status: "passed",
        detail: `Cold/invalidated path returned fresh value under ${cacheState}.`
      };
    }
  }

  if (mode === "flag-interaction-bug") {
    const required = experiment.oracle.requiredFlagsOn ?? [];
    const allOn = required.every((flagId) => combination.values[flagId] === "on");
    const anyOn = required.some((flagId) => combination.values[flagId] === "on");
    if (allOn) {
      return {
        combinationId: combination.id,
        values: combination.values,
        status: "failed",
        detail: `Pairwise flag combination ${required.join("+")}=on fails while independent ons pass.`
      };
    }
    if (anyOn || required.every((flagId) => combination.values[flagId] === "off")) {
      return {
        combinationId: combination.id,
        values: combination.values,
        status: "passed",
        detail: "Independent flag states pass."
      };
    }
  }

  if (mode === "clean" || mode === "repaired") {
    const forbidden = experiment.oracle.forbidden ?? [];
    for (const rule of forbidden) {
      const [flagId, value] = rule.split("=");
      if (flagId && value && combination.values[flagId] === value) {
        return {
          combinationId: combination.id,
          values: combination.values,
          status: "skipped",
          detail: `Forbidden combination ${rule} excluded as expected flag-specific behavior.`
        };
      }
    }
    return {
      combinationId: combination.id,
      values: combination.values,
      status: "passed",
      detail: "Oracle passed for selected state combination."
    };
  }

  void flags;
  return {
    combinationId: combination.id,
    values: combination.values,
    status: "passed",
    detail: "No failing oracle condition matched."
  };
}
