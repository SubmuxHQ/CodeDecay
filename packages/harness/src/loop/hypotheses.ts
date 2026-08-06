import type { LoopHypothesisStatusSnapshot, LoopAgentResult } from "./types";

/**
 * Verifier output is advisory. Parse proposed hypotheses/challenges without
 * granting proof authority — only deterministic checks can confirm/refute.
 */
export function parseVerifierHypothesisProposals(verifier: LoopAgentResult | undefined): LoopHypothesisStatusSnapshot[] {
  if (!verifier || verifier.role !== "verifier") {
    return [];
  }

  const text = `${verifier.stdout}\n${verifier.stderr}`;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const proposals: LoopHypothesisStatusSnapshot[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = /^(?:hypothesis|challenge|proof-task)\s*:\s*(.+)$/i.exec(line);
    if (!match?.[1]) {
      continue;
    }
    const title = match[1].trim();
    const hypothesisId = `verifier:${slug(title)}`;
    if (seen.has(hypothesisId)) {
      continue;
    }
    seen.add(hypothesisId);
    proposals.push({
      hypothesisId,
      status: "candidate"
    });
  }

  return proposals;
}

export function mergeHypothesisStatuses(
  existing: LoopHypothesisStatusSnapshot[],
  additions: LoopHypothesisStatusSnapshot[]
): LoopHypothesisStatusSnapshot[] {
  const byId = new Map(existing.map((entry) => [entry.hypothesisId, entry]));
  for (const addition of additions) {
    const current = byId.get(addition.hypothesisId);
    if (!current) {
      byId.set(addition.hypothesisId, addition);
      continue;
    }
    // Never let advisory verifier output escalate beyond candidate/planned.
    if (current.status === "confirmed" || current.status === "refuted") {
      continue;
    }
    byId.set(addition.hypothesisId, {
      hypothesisId: addition.hypothesisId,
      status: current.status === "planned" ? "planned" : addition.status
    });
  }
  return [...byId.values()];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}
