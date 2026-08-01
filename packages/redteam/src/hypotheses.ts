import type {
  RedteamConsequenceHypothesis,
  RedteamHypothesisObservation,
  RedteamHypothesisReport,
  RedteamHypothesisVerifierKind,
  RedteamHypothesisVerifierResult,
  RedteamInvestigationSuggestion
} from "./types";

const MAX_TOP_HYPOTHESES = 5;
const MAX_STRING_LENGTH = 360;
const MAX_LIST_ITEMS = 8;

const statuses = new Set(["candidate", "planned", "confirmed", "refuted", "inconclusive", "needs-human"]);
const severities = new Set(["low", "medium", "high"]);
const verifierKinds = new Set([
  "configured-check",
  "oss-tool-adapter",
  "product-probe",
  "differential",
  "static-analyzer",
  "human-decision"
]);

export interface CreateHypothesisReportInput {
  rawText?: string | undefined;
  suggestions?: RedteamInvestigationSuggestion[] | undefined;
  evidenceIds: string[];
  observation?: RedteamHypothesisObservation | undefined;
}

export interface CreateObservedHypothesisReportInput {
  rawText: string;
  suggestions: RedteamInvestigationSuggestion[];
  evidenceIds: string[];
  providerId: string;
  model?: string | undefined;
  latencyMs?: number | undefined;
  costBudgetUsd?: number | undefined;
}

interface RequiredHypothesisFields {
  claim: string;
  affectedRequirementOrFlow: string;
  causalChain: string[];
  assumptions: string[];
  uncertainty: string;
  userVisibleConsequence: string;
  disconfirmingResult: string;
}

export function createConsequenceHypothesisReport(input: CreateHypothesisReportInput): RedteamHypothesisReport {
  const evidenceIds = unique(input.evidenceIds.filter((id) => id.trim().length > 0));
  const parsed = parseJsonFromText(input.rawText ?? "");
  const values = objectArray(parsed, "hypotheses");
  const rejected: RedteamHypothesisReport["rejected"] = [];
  const seenClaims = new Set<string>();
  const hypotheses: RedteamConsequenceHypothesis[] = [];

  values.forEach((value, index) => {
    const normalized = normalizeHypothesis(value, index, evidenceIds, seenClaims);
    if (normalized.hypothesis) {
      hypotheses.push(normalized.hypothesis);
    }
    for (const reason of normalized.rejected) {
      rejected.push({ index, reason });
    }
  });

  if (hypotheses.length === 0 && values.length === 0 && input.suggestions?.length) {
    rejected.push({
      index: -1,
      reason: "Provider returned legacy suggestions but no hypotheses; suggestions remain untrusted and cannot confirm risk."
    });
  }

  const ranked = hypotheses
    .map((hypothesis) => ({ ...hypothesis, score: scoreHypothesis(hypothesis) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((hypothesis, index) => ({ ...hypothesis, rank: index + 1 }));

  return {
    schemaVersion: 1,
    hypotheses: ranked.slice(0, MAX_TOP_HYPOTHESES),
    overflow: ranked.slice(MAX_TOP_HYPOTHESES),
    rejected,
    evidenceIds,
    observation: input.observation,
    untrusted: true,
    deterministicRiskChanged: false
  };
}

export function createObservedConsequenceHypothesisReport(
  input: CreateObservedHypothesisReportInput
): RedteamHypothesisReport {
  return createConsequenceHypothesisReport({
    rawText: input.rawText,
    suggestions: input.suggestions,
    evidenceIds: input.evidenceIds,
    observation: {
      providerId: input.providerId,
      model: input.model,
      inputEvidenceIds: input.evidenceIds,
      latencyMs: input.latencyMs,
      costBudgetUsd: input.costBudgetUsd
    }
  });
}

export function applyHypothesisVerifierResults(
  report: RedteamHypothesisReport,
  results: RedteamHypothesisVerifierResult[]
): RedteamHypothesisReport {
  const resultById = new Map(results.map((result) => [result.hypothesisId, result]));
  const update = (hypothesis: RedteamConsequenceHypothesis): RedteamConsequenceHypothesis => {
    const result = resultById.get(hypothesis.id);
    if (!result) {
      return hypothesis;
    }

    const evidenceIds = unique([...hypothesis.evidenceIds, ...result.evidenceIds]);
    if (!result.trusted && result.status === "confirmed") {
      return {
        ...hypothesis,
        status: "needs-human",
        evidenceIds,
        limitations: unique([
          ...hypothesis.limitations,
          "Untrusted verifier output cannot confirm a hypothesis; human or tool evidence is required."
        ])
      };
    }

    return {
      ...hypothesis,
      status: result.status,
      evidenceIds,
      limitations: result.summary
        ? unique([...hypothesis.limitations, `Verifier: ${truncate(result.summary)}`])
        : hypothesis.limitations
    };
  };

  return {
    ...report,
    hypotheses: report.hypotheses.map(update),
    overflow: report.overflow.map(update)
  };
}

export function collectHypothesisEvidenceIds(context: unknown): string[] {
  const ids = new Set<string>();
  collectIds(context, ids);
  return [...ids].sort();
}

function normalizeHypothesis(
  value: unknown,
  index: number,
  evidenceIds: string[],
  seenClaims: Set<string>
): { hypothesis?: RedteamConsequenceHypothesis | undefined; rejected: string[] } {
  if (!isPlainObject(value)) {
    return { rejected: ["Hypothesis must be an object."] };
  }

  const rejected: string[] = [];
  const fields = readRequiredHypothesisFields(value, rejected);
  const citedEvidence = stringList(value.evidenceIds, "evidenceIds", rejected);
  const knownEvidence = new Set(evidenceIds);
  const acceptedEvidence = unique(citedEvidence.filter((id) => knownEvidence.has(id)));
  const unknownEvidence = citedEvidence.filter((id) => !knownEvidence.has(id));

  if (acceptedEvidence.length === 0) {
    rejected.push("Hypothesis must cite at least one known evidence id.");
  }
  if (unknownEvidence.length > 0) {
    rejected.push(`Ignored unknown evidence ids: ${unknownEvidence.join(", ")}.`);
  }

  const claimKey = fields.claim.toLocaleLowerCase();
  if (claimKey && seenClaims.has(claimKey)) {
    rejected.push("Duplicate hypothesis claim was ignored.");
  }

  const severitySuggestion = normalizeSeverity(value.severitySuggestion, rejected);
  const status = normalizeStatus(value.status, rejected);
  const proposedVerifier = normalizeVerifier(value.proposedVerifier, rejected);
  if (
    !hasRequiredHypothesisFields(fields) ||
    acceptedEvidence.length === 0 ||
    (claimKey && seenClaims.has(claimKey))
  ) {
    return { rejected };
  }

  seenClaims.add(claimKey);
  const limitations = rejected.filter((reason) =>
    reason.startsWith("Ignored") || reason.startsWith("Invalid")
  );
  return {
    hypothesis: {
      id: typeof value.id === "string" && value.id.trim() ? truncate(value.id.trim()) : `hypothesis-${index + 1}`,
      claim: fields.claim,
      affectedRequirementOrFlow: fields.affectedRequirementOrFlow,
      causalChain: fields.causalChain,
      evidenceIds: acceptedEvidence,
      assumptions: fields.assumptions,
      uncertainty: fields.uncertainty,
      userVisibleConsequence: fields.userVisibleConsequence,
      severitySuggestion,
      disconfirmingResult: fields.disconfirmingResult,
      proposedVerifier,
      status,
      rank: 0,
      score: 0,
      limitations
    },
    rejected: rejected.filter((reason) => !limitations.includes(reason))
  };
}

function readRequiredHypothesisFields(
  value: Record<string, unknown>,
  rejected: string[]
): RequiredHypothesisFields {
  return {
    claim: requiredString(value.claim, "claim", rejected),
    affectedRequirementOrFlow: requiredString(
      value.affectedRequirementOrFlow,
      "affectedRequirementOrFlow",
      rejected
    ),
    causalChain: stringList(value.causalChain, "causalChain", rejected),
    assumptions: stringList(value.assumptions, "assumptions", rejected),
    uncertainty: requiredString(value.uncertainty, "uncertainty", rejected),
    userVisibleConsequence: requiredString(value.userVisibleConsequence, "userVisibleConsequence", rejected),
    disconfirmingResult: requiredString(value.disconfirmingResult, "disconfirmingResult", rejected)
  };
}

function hasRequiredHypothesisFields(fields: RequiredHypothesisFields): boolean {
  return Boolean(
    fields.claim &&
    fields.affectedRequirementOrFlow &&
    fields.userVisibleConsequence &&
    fields.disconfirmingResult &&
    fields.uncertainty &&
    fields.causalChain.length > 0
  );
}

function normalizeSeverity(value: unknown, rejected: string[]): RedteamConsequenceHypothesis["severitySuggestion"] {
  if (typeof value === "string" && severities.has(value)) {
    return value as RedteamConsequenceHypothesis["severitySuggestion"];
  }
  if (typeof value === "string") {
    rejected.push("Invalid severitySuggestion was downgraded to medium.");
  }
  return "medium";
}

function normalizeStatus(value: unknown, rejected: string[]): RedteamConsequenceHypothesis["status"] {
  if (typeof value === "string" && statuses.has(value)) {
    return value as RedteamConsequenceHypothesis["status"];
  }
  if (typeof value === "string") {
    rejected.push("Invalid status was downgraded to candidate.");
  }
  return "candidate";
}

function normalizeVerifier(value: unknown, rejected: string[]): RedteamConsequenceHypothesis["proposedVerifier"] {
  if (!isPlainObject(value)) {
    rejected.push("Missing proposedVerifier; human decision required.");
    return { kind: "human-decision", name: "Human review" };
  }

  const kind = normalizeVerifierKind(value.kind, rejected);
  const name = optionalString(value.name) ?? "Human review";
  const verifier: RedteamConsequenceHypothesis["proposedVerifier"] = { kind, name };
  Object.assign(verifier, optionalVerifierField("command", value.command));
  Object.assign(verifier, optionalVerifierField("expectedEvidence", value.expectedEvidence));
  return verifier;
}

function normalizeVerifierKind(value: unknown, rejected: string[]): RedteamHypothesisVerifierKind {
  if (typeof value === "string" && verifierKinds.has(value)) {
    return value as RedteamHypothesisVerifierKind;
  }
  if (typeof value === "string") {
    rejected.push("Invalid proposedVerifier.kind was downgraded to human-decision.");
  }
  return "human-decision";
}

function optionalVerifierField(
  key: "command" | "expectedEvidence",
  value: unknown
): Partial<Pick<RedteamConsequenceHypothesis["proposedVerifier"], "command" | "expectedEvidence">> {
  const text = optionalString(value);
  return text ? { [key]: text } : {};
}

function scoreHypothesis(hypothesis: RedteamConsequenceHypothesis): number {
  const severity = hypothesis.severitySuggestion === "high" ? 30 : hypothesis.severitySuggestion === "medium" ? 18 : 8;
  const evidenceCoverage = Math.min(20, hypothesis.evidenceIds.length * 7);
  const feasibility = hypothesis.proposedVerifier.kind === "human-decision" ? 4 : 18;
  const uncertaintyReduction = hypothesis.disconfirmingResult.length > 20 ? 14 : 5;
  const consequence = hypothesis.userVisibleConsequence.length > 20 ? 16 : 6;
  return severity + evidenceCoverage + feasibility + uncertaintyReduction + consequence;
}

function requiredString(value: unknown, name: string, rejected: string[]): string {
  if (typeof value !== "string" || !value.trim()) {
    rejected.push(`Missing required ${name}.`);
    return "";
  }
  return truncate(value.trim());
}

function stringList(value: unknown, name: string, rejected: string[]): string[] {
  if (!Array.isArray(value)) {
    rejected.push(`Missing required ${name} array.`);
    return [];
  }
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (items.length !== value.length) {
    rejected.push(`Ignored non-string entries in ${name}.`);
  }
  return unique(items.map((item) => truncate(item.trim()))).slice(0, MAX_LIST_ITEMS);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? truncate(value.trim()) : undefined;
}

function objectArray(source: unknown, key: string): unknown[] {
  if (!isPlainObject(source) || !Array.isArray(source[key])) {
    return [];
  }
  return source[key];
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const candidate = stripJsonFence(trimmed);
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function stripJsonFence(trimmed: string): string {
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return trimmed;
  }

  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd === -1) {
    return trimmed;
  }

  const fenceLabel = trimmed.slice(3, firstLineEnd).trim().toLocaleLowerCase();
  if (fenceLabel !== "" && fenceLabel !== "json") {
    return trimmed;
  }

  return trimmed.slice(firstLineEnd + 1, -3).trim();
}

function collectIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, ids);
    }
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  const id = value.id;
  if (typeof id === "string" && id.trim()) {
    ids.add(id.trim());
  }
  for (const child of Object.values(value)) {
    collectIds(child, ids);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH - 3)}...` : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
