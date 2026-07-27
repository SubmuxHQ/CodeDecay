import {
  compareRiskLevels,
  type CodeDecayReport,
  type ImpactedArea,
  type RequirementContext,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import {
  matchKnowledgePacks,
  type KnowledgeEdgeCase
} from "@submuxhq/codedecay-knowledge";
import {
  matchesMemoryEntry,
  type CodeDecayMemory,
  type MemoryMatcher
} from "@submuxhq/codedecay-memory";
import { EDGE_CASE_TEMPLATES } from "./catalog";
import {
  downstreamConsumersForScope,
  hasConcreteSurface,
  mergeScope,
  scopeForArea,
  scopeForReport,
  uniqueSorted
} from "./scope";
import type {
  RedteamEdgeCase,
  RedteamEdgeCaseConfidence,
  RedteamEdgeCasePlan,
  RedteamEdgeCaseSource,
  RedteamEdgeCaseSourceKind,
  RedteamInvestigation,
  RedteamPatternInsight
} from "../types";

export const MAX_RANKED_EDGE_CASES = 8;

interface CreateEdgeCasePlanInput {
  report: CodeDecayReport;
  patterns?: RedteamPatternInsight[] | undefined;
  memory?: CodeDecayMemory | undefined;
  requirements?: RequirementContext | undefined;
  investigation?: RedteamInvestigation | undefined;
}

const PATTERN_SCENARIO_IDS: Record<string, string> = {
  "owasp-auth-session-negative-paths": "auth-fail-closed",
  "api-schema-fuzz-boundaries": "api-invalid-input",
  "database-schema-compatibility": "database-legacy-data",
  "browser-user-flow-states": "ui-empty-error-permission",
  "supply-chain-config-checks": "config-missing-environment"
};

const KNOWLEDGE_MATCHERS: Record<string, RegExp> = {
  "jwt-decode-without-verify": /\b(?:jwt\.decode|decodejwt|atob)\b/i,
  "jwt-algorithm-confusion": /\b(?:algorithms?|ignoreexpiration|allowinvalidasymmetrickeytypes|none)\b/i,
  "jwt-untrusted-key-header": /\b(?:kid|jku|jwk|x5u|jwks)\b/i,
  "jwt-weak-or-shared-secret": /\b(?:jwt|token).{0,80}\b(?:secret|hmac)\b|\b(?:secret|hmac).{0,80}\b(?:jwt|token)\b/i,
  "jwt-missing-registered-claim-validation": /\b(?:ignoreexpiration|issuer|audience|clocktolerance|maxage)\b/i,
  "jwt-storage-and-revocation-gap": /\b(?:localstorage|sessionstorage|logout|revocation|tokenversion)\b/i
};

export function createEdgeCasePlan(input: CreateEdgeCasePlanInput): RedteamEdgeCasePlan {
  const candidates = new Map<string, RedteamEdgeCase>();

  addAreaScenarios(candidates, input.report);
  addPatternProvenance(candidates, input.patterns ?? []);
  addRequirementContext(candidates, input.requirements);
  addMemoryContext(candidates, input.report, input.memory);
  addKnowledgeScenarios(candidates, input.report);
  addAgentSuggestions(candidates, input.report, input.investigation, input.requirements);

  const all = [...candidates.values()]
    .map((candidate) => finalizeScenario(candidate, input.report))
    .sort(compareScenarios);
  return {
    ranked: all.slice(0, MAX_RANKED_EDGE_CASES),
    overflow: all.slice(MAX_RANKED_EDGE_CASES),
    all
  };
}

function addAreaScenarios(candidates: Map<string, RedteamEdgeCase>, report: CodeDecayReport): void {
  for (const template of EDGE_CASE_TEMPLATES) {
    const scope = scopeForArea(report, template.area);
    if (!hasConcreteSurface(scope) || template.applies?.(report, scope) === false) {
      continue;
    }
    const sources: RedteamEdgeCaseSource[] = [
      source("area-rule", `area:${template.area}`, `${template.area} impact rule`, "deterministic")
    ];
    for (const route of scope.routes) {
      sources.push(source("route-impact", `route:${route}`, route, "deterministic"));
    }
    for (const symbol of scope.symbols) {
      sources.push(source("symbol-impact", `symbol:${symbol}`, symbol, "deterministic"));
    }
    addOrMerge(candidates, {
      id: template.id,
      title: template.title(scope),
      trigger: template.trigger,
      expectedBehavior: template.expectedBehavior,
      userVisibleFailure: template.userVisibleFailure,
      downstreamConsumers: downstreamConsumersForScope(report, scope),
      scope,
      confidence: confidenceForScope(report, scope),
      derivation: "deterministic",
      sources,
      proof: template.proof(scope),
      score: 0
    });
  }
}

function addPatternProvenance(
  candidates: Map<string, RedteamEdgeCase>,
  patterns: RedteamPatternInsight[]
): void {
  for (const pattern of patterns) {
    const scenarioId = PATTERN_SCENARIO_IDS[pattern.id];
    if (!scenarioId) {
      continue;
    }
    const scenario = candidates.get(scenarioId);
    if (!scenario) {
      continue;
    }
    scenario.sources = mergeSources(scenario.sources, [
      source("pattern-pack", pattern.id, pattern.title, "curated-guidance")
    ]);
  }
}

function addRequirementContext(
  candidates: Map<string, RedteamEdgeCase>,
  requirements: RequirementContext | undefined
): void {
  if (!requirements) {
    return;
  }
  for (const criterion of requirements.acceptanceCriteria) {
    const scenarioId = classifyScenario(`${criterion.text} ${criterion.requiredProof.join(" ")}`);
    const scenario = scenarioId ? candidates.get(scenarioId) : undefined;
    if (!scenario) {
      continue;
    }
    scenario.scope = mergeScope(scenario.scope, { requirementIds: [criterion.id] });
    scenario.sources = mergeSources(scenario.sources, [
      source("requirement", `requirement:${criterion.id}`, criterion.text, "untrusted-context")
    ]);
  }
  for (const flow of requirements.affectedFlows) {
    const scenarioId = classifyScenario(`${flow.name} ${flow.description ?? ""} ${flow.kind}`);
    const scenario = scenarioId ? candidates.get(scenarioId) : undefined;
    if (!scenario) {
      continue;
    }
    scenario.scope = mergeScope(scenario.scope, { flows: [flow.name] });
    scenario.sources = mergeSources(scenario.sources, [
      source("requirement", `flow:${flow.name}`, flow.name, "untrusted-context")
    ]);
  }
  for (const [index, invariant] of requirements.invariants.entries()) {
    const scenarioId = classifyScenario(invariant.text);
    const scenario = scenarioId ? candidates.get(scenarioId) : undefined;
    if (!scenario) {
      continue;
    }
    scenario.sources = mergeSources(scenario.sources, [
      source("requirement", `invariant:${index + 1}`, invariant.text, "untrusted-context")
    ]);
  }
}

function addMemoryContext(
  candidates: Map<string, RedteamEdgeCase>,
  report: CodeDecayReport,
  memory: CodeDecayMemory | undefined
): void {
  if (!memory) {
    return;
  }
  for (const flow of memory.flows) {
    addMemoryEntry(
      candidates,
      report,
      flow,
      `${flow.name} ${flow.description ?? ""} ${(flow.checks ?? []).join(" ")}`,
      `memory-flow:${flow.name}`,
      flow.name
    );
  }
  for (const invariant of memory.invariants) {
    addMemoryEntry(
      candidates,
      report,
      invariant,
      `${invariant.name} ${invariant.description}`,
      `memory-invariant:${invariant.name}`,
      invariant.name
    );
  }
  for (const regression of memory.regressions) {
    addMemoryEntry(
      candidates,
      report,
      regression,
      `${regression.title} ${regression.description} ${regression.check ?? ""}`,
      `memory-regression:${regression.title}`,
      regression.title
    );
  }
}

function addMemoryEntry(
  candidates: Map<string, RedteamEdgeCase>,
  report: CodeDecayReport,
  entry: MemoryMatcher,
  text: string,
  id: string,
  label: string
): void {
  if (!matchesMemoryEntry(entry, report.changedFiles, report.impactedAreas)) {
    return;
  }
  const scenarioId = scenarioIdForMemory(entry, text);
  const scenario = scenarioId ? candidates.get(scenarioId) : undefined;
  if (!scenario) {
    return;
  }
  const flow = id.startsWith("memory-flow:") ? [label] : [];
  scenario.scope = mergeScope(scenario.scope, { flows: flow });
  scenario.sources = mergeSources(scenario.sources, [
    source("memory", id, label, "untrusted-context")
  ]);
}

function addKnowledgeScenarios(
  candidates: Map<string, RedteamEdgeCase>,
  report: CodeDecayReport
): void {
  const changedText = report.changedFiles
    .map((file) => file.addedLines.map((line) => line.content).join("\n"))
    .join("\n");
  const packs = matchKnowledgePacks({
    impactedAreas: report.impactedAreas.map((area) => area.kind),
    changedPaths: report.changedFiles.map((file) => file.path)
  });
  for (const pack of packs) {
    for (const edgeCase of pack.edgeCases) {
      const matcher = KNOWLEDGE_MATCHERS[edgeCase.id];
      if (!matcher?.test(changedText)) {
        continue;
      }
      const equivalentId = knowledgeEquivalentScenario(edgeCase.id);
      const existing = equivalentId ? candidates.get(equivalentId) : undefined;
      if (existing) {
        existing.sources = mergeSources(existing.sources, [
          source("pattern-pack", `knowledge:${edgeCase.id}`, edgeCase.title, "curated-guidance")
        ]);
        continue;
      }
      const scope = scopeForArea(report, "auth");
      const fallbackScope = hasConcreteSurface(scope) ? scope : scopeForArea(report, "api");
      if (!hasConcreteSurface(fallbackScope)) {
        continue;
      }
      addOrMerge(candidates, knowledgeScenario(edgeCase, fallbackScope, report));
    }
  }
}

function addAgentSuggestions(
  candidates: Map<string, RedteamEdgeCase>,
  report: CodeDecayReport,
  investigation: RedteamInvestigation | undefined,
  requirements: RequirementContext | undefined
): void {
  if (investigation?.status !== "completed") {
    return;
  }
  for (const [suggestionIndex, suggestion] of investigation.suggestions.entries()) {
    for (const [edgeCaseIndex, edgeCase] of (suggestion.edgeCases ?? []).entries()) {
      if (isGenericProofChore(edgeCase)) {
        continue;
      }
      const scenarioId = classifyScenario(`${suggestion.title} ${suggestion.detail} ${edgeCase}`);
      const existing = scenarioId ? candidates.get(scenarioId) : undefined;
      const sourceEntry = source(
        "agent-investigation",
        `agent:${suggestionIndex + 1}:${edgeCaseIndex + 1}`,
        suggestion.title,
        "untrusted-suggestion"
      );
      if (existing) {
        existing.scope = mergeScope(existing.scope, {
          flows: matchedAgentFlows(suggestion.affectedFlows, requirements)
        });
        existing.sources = mergeSources(existing.sources, [sourceEntry]);
        continue;
      }
      const flows = matchedAgentFlows(suggestion.affectedFlows, requirements);
      if (flows.length === 0) {
        continue;
      }
      const broadScope = mergeScope(scopeForReport(report), { flows });
      addOrMerge(candidates, {
        id: `agent-${slug(suggestion.title)}-${edgeCaseIndex + 1}`,
        title: suggestion.title,
        trigger: edgeCase,
        expectedBehavior: suggestion.detail,
        userVisibleFailure: `${flows[0]} produces incorrect or unavailable behavior for its user or downstream consumer.`,
        downstreamConsumers: flows,
        scope: broadScope,
        confidence: "low",
        derivation: "agent-suggestion",
        sources: [sourceEntry],
        proof: {
          kind: "integration",
          recommendation:
            suggestion.proposedProof?.[edgeCaseIndex] ??
            suggestion.proposedProof?.[0] ??
            `Add integration proof for ${flows[0]}.`
        },
        score: 0
      });
    }
  }
}

function knowledgeScenario(
  edgeCase: KnowledgeEdgeCase,
  scope: RedteamEdgeCase["scope"],
  report: CodeDecayReport
): RedteamEdgeCase {
  return {
    id: edgeCase.id,
    title: edgeCase.title,
    trigger: edgeCase.rootCause,
    expectedBehavior: edgeCase.fixHint,
    userVisibleFailure: edgeCase.symptom,
    downstreamConsumers: downstreamConsumersForScope(report, scope),
    scope,
    confidence: report.securityCandidates?.some((candidate) => candidate.ruleId === "security-jwt-unsafe-verification")
      ? "high"
      : "medium",
    derivation: "deterministic",
    sources: [
      source("pattern-pack", `knowledge:${edgeCase.id}`, edgeCase.title, "curated-guidance")
    ],
    proof: {
      kind: "api-integration",
      recommendation: `${edgeCase.detectionHint} Exercise the affected route with a token that triggers this condition.`
    },
    score: 0
  };
}

function addOrMerge(candidates: Map<string, RedteamEdgeCase>, incoming: RedteamEdgeCase): void {
  const existing = candidates.get(incoming.id);
  if (!existing) {
    candidates.set(incoming.id, incoming);
    return;
  }
  existing.scope = mergeScope(existing.scope, incoming.scope);
  existing.sources = mergeSources(existing.sources, incoming.sources);
  existing.downstreamConsumers = uniqueSorted([
    ...existing.downstreamConsumers,
    ...incoming.downstreamConsumers
  ]);
  existing.confidence = higherConfidence(existing.confidence, incoming.confidence);
}

function finalizeScenario(scenario: RedteamEdgeCase, report: CodeDecayReport): RedteamEdgeCase {
  const derivation = derivationFromSources(scenario.sources);
  return {
    ...scenario,
    derivation,
    sources: [...scenario.sources].sort((left, right) =>
      `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)
    ),
    score: scenarioScore(scenario, report)
  };
}

function scenarioScore(scenario: RedteamEdgeCase, report: CodeDecayReport): number {
  const risk = highestRiskForScenario(scenario, report);
  const riskScore: Record<RiskLevel, number> = { high: 40, medium: 24, low: 10 };
  const confidenceScore: Record<RedteamEdgeCaseConfidence, number> = { high: 20, medium: 12, low: 4 };
  const surfaceScore = Math.min(
    22,
    scenario.scope.routes.length * 8 +
      scenario.scope.symbols.length * 5 +
      scenario.scope.flows.length * 3 +
      scenario.scope.requirementIds.length * 3 +
      (scenario.scope.files.length > 0 ? 3 : 0)
  );
  const visibilityScore = scenario.scope.areas.some((area) => area === "auth" || area === "api" || area === "ui")
    ? 12
    : scenario.scope.areas.includes("database")
      ? 9
      : 6;
  const provenanceScore = Math.min(6, scenario.sources.length * 2);
  const suggestionPenalty = scenario.derivation === "agent-suggestion" ? 18 : 0;
  return Math.max(
    0,
    Math.min(100, riskScore[risk] + confidenceScore[scenario.confidence] + surfaceScore + visibilityScore + provenanceScore - suggestionPenalty)
  );
}

function highestRiskForScenario(scenario: RedteamEdgeCase, report: CodeDecayReport): RiskLevel {
  return report.impactedAreas
    .filter((area) => scenario.scope.areas.includes(area.kind))
    .map((area) => area.risk)
    .sort((left, right) => compareRiskLevels(right, left))[0] ?? report.summary.riskLevel;
}

function compareScenarios(left: RedteamEdgeCase, right: RedteamEdgeCase): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.id.localeCompare(right.id);
}

function confidenceForScope(
  report: CodeDecayReport,
  scope: RedteamEdgeCase["scope"]
): RedteamEdgeCaseConfidence {
  const hasHighRiskArea = report.impactedAreas.some(
    (area) => scope.areas.includes(area.kind) && area.risk === "high"
  );
  if (hasHighRiskArea && scope.routes.length > 0) {
    return "high";
  }
  return hasHighRiskArea || scope.symbols.length > 0 ? "medium" : "low";
}

function scenarioIdForMemory(entry: MemoryMatcher, text: string): string | undefined {
  for (const area of entry.areas ?? []) {
    const id = scenarioIdForArea(area);
    if (id) {
      return id;
    }
  }
  return classifyScenario(text);
}

function scenarioIdForArea(area: ImpactedArea["kind"]): string | undefined {
  return EDGE_CASE_TEMPLATES.find((template) => template.area === area)?.id;
}

function classifyScenario(value: string): string | undefined {
  const lower = value.toLowerCase();
  if (/\b(auth|authori[sz]|credential|session|token|permission|privilege|forbidden|401|403)\b/.test(lower)) {
    return "auth-fail-closed";
  }
  if (/\b(database|schema|migration|record|row|backfill|sql|prisma|null)\b/.test(lower)) {
    return "database-legacy-data";
  }
  if (/\b(ui|screen|page|browser|loading|empty state|stale data|viewport)\b/.test(lower)) {
    return "ui-empty-error-permission";
  }
  if (/\b(config|environment|env var|startup|build|secret|ssl)\b/.test(lower)) {
    return "config-missing-environment";
  }
  if (/\b(api|route|endpoint|request|response|payload|http|malformed|enum)\b/.test(lower)) {
    return "api-invalid-input";
  }
  return undefined;
}

function knowledgeEquivalentScenario(id: string): string | undefined {
  if (id === "jwt-missing-registered-claim-validation") {
    return "auth-fail-closed";
  }
  return undefined;
}

function matchedAgentFlows(
  affectedFlows: string[] | undefined,
  requirements: RequirementContext | undefined
): string[] {
  if (!affectedFlows?.length || !requirements) {
    return [];
  }
  const known = new Map(requirements.affectedFlows.map((flow) => [flow.name.toLowerCase(), flow.name]));
  return uniqueSorted(
    affectedFlows
      .map((flow) => known.get(flow.toLowerCase()))
      .filter((flow): flow is string => Boolean(flow))
  );
}

function isGenericProofChore(value: string): boolean {
  return /\b(?:add|run|re-run|rerun|strengthen|update|replace)\b.*\b(?:test|check|coverage|suite|command)\b/i.test(value);
}

function source(
  kind: RedteamEdgeCaseSourceKind,
  id: string,
  label: string,
  trust: RedteamEdgeCaseSource["trust"]
): RedteamEdgeCaseSource {
  return { kind, id, label, trust };
}

function mergeSources(
  left: RedteamEdgeCaseSource[],
  right: RedteamEdgeCaseSource[]
): RedteamEdgeCaseSource[] {
  const byKey = new Map<string, RedteamEdgeCaseSource>();
  for (const item of [...left, ...right]) {
    byKey.set(`${item.kind}:${item.id}`, item);
  }
  return [...byKey.values()];
}

function derivationFromSources(
  sources: RedteamEdgeCaseSource[]
): RedteamEdgeCase["derivation"] {
  const hasAgent = sources.some((item) => item.kind === "agent-investigation");
  const hasNonAgent = sources.some((item) => item.kind !== "agent-investigation");
  if (hasAgent && hasNonAgent) {
    return "mixed";
  }
  return hasAgent ? "agent-suggestion" : "deterministic";
}

function higherConfidence(
  left: RedteamEdgeCaseConfidence,
  right: RedteamEdgeCaseConfidence
): RedteamEdgeCaseConfidence {
  const order: RedteamEdgeCaseConfidence[] = ["low", "medium", "high"];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "suggested-scenario";
}
