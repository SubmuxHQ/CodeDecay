export type RequirementConfidence = "low" | "medium" | "high";
export type RequirementSourceKind =
  | "task"
  | "artifact"
  | "issue"
  | "pull-request"
  | "repository"
  | "memory"
  | "integration";
export type RequirementFlowKind = "user" | "api" | "job" | "data" | "config";

export interface RequirementSource {
  id: string;
  kind: RequirementSourceKind;
  label: string;
  location?: string | undefined;
}

export interface RequirementStatement {
  text: string;
  sourceIds: string[];
}

export interface AcceptanceCriterion extends RequirementStatement {
  id: string;
  requiredProof: string[];
}

export interface AffectedFlow {
  name: string;
  kind: RequirementFlowKind;
  description?: string | undefined;
  sourceIds: string[];
}

export interface RequirementContext {
  schemaVersion: 1;
  confidence: RequirementConfidence;
  sources: RequirementSource[];
  task: RequirementStatement;
  currentBehavior: RequirementStatement[];
  expectedBehavior: RequirementStatement[];
  acceptanceCriteria: AcceptanceCriterion[];
  nonGoals: RequirementStatement[];
  affectedFlows: AffectedFlow[];
  invariants: RequirementStatement[];
  architectureConstraints: RequirementStatement[];
  unresolvedQuestions: RequirementStatement[];
}

export interface RequirementContextInput {
  confidence?: RequirementConfidence | undefined;
  task?: string | RequirementStatementInput | undefined;
  currentBehavior?: RequirementStatementInput[] | undefined;
  expectedBehavior?: RequirementStatementInput[] | undefined;
  acceptanceCriteria?: AcceptanceCriterionInput[] | undefined;
  nonGoals?: RequirementStatementInput[] | undefined;
  affectedFlows?: AffectedFlowInput[] | undefined;
  invariants?: RequirementStatementInput[] | undefined;
  architectureConstraints?: RequirementStatementInput[] | undefined;
  unresolvedQuestions?: RequirementStatementInput[] | undefined;
  sources?: RequirementSource[] | undefined;
}

export type RequirementStatementInput = string | {
  text: string;
  sourceIds?: string[] | undefined;
};

export type AcceptanceCriterionInput = string | {
  id?: string | undefined;
  text: string;
  requiredProof?: string[] | undefined;
  sourceIds?: string[] | undefined;
};

export interface AffectedFlowInput {
  name: string;
  kind: RequirementFlowKind;
  description?: string | undefined;
  sourceIds?: string[] | undefined;
}

export function normalizeRequirementContext(input: {
  task: string;
  context?: RequirementContextInput | RequirementContext | undefined;
  source: RequirementSource;
}): RequirementContext {
  const context = input.context ?? {};
  const sources = dedupeSources([...(context.sources ?? []), input.source]);
  const taskSourceIds = [input.source.id];
  const contextSourceIds = context.sources?.map((source) => source.id) ?? [];
  const fallbackSourceIds = contextSourceIds.length > 0 ? contextSourceIds : taskSourceIds;

  return {
    schemaVersion: 1,
    confidence: context.confidence ?? confidenceFromContext(context),
    sources,
    task: normalizeStatement(context.task ?? input.task, context.task ? fallbackSourceIds : taskSourceIds),
    currentBehavior: normalizeStatements(context.currentBehavior, fallbackSourceIds),
    expectedBehavior: normalizeStatements(context.expectedBehavior, fallbackSourceIds),
    acceptanceCriteria: (context.acceptanceCriteria ?? []).map((criterion, index) =>
      normalizeCriterion(criterion, index, fallbackSourceIds)
    ),
    nonGoals: normalizeStatements(context.nonGoals, fallbackSourceIds),
    affectedFlows: (context.affectedFlows ?? []).map((flow) => ({
      name: flow.name.trim(),
      kind: flow.kind,
      ...(flow.description?.trim() ? { description: flow.description.trim() } : {}),
      sourceIds: normalizeSourceIds(flow.sourceIds, fallbackSourceIds)
    })),
    invariants: normalizeStatements(context.invariants, fallbackSourceIds),
    architectureConstraints: normalizeStatements(context.architectureConstraints, fallbackSourceIds),
    unresolvedQuestions: normalizeStatements(context.unresolvedQuestions, fallbackSourceIds)
  };
}

function confidenceFromContext(context: RequirementContextInput | RequirementContext): RequirementConfidence {
  if ((context.acceptanceCriteria?.length ?? 0) > 0 && (context.affectedFlows?.length ?? 0) > 0) {
    return "high";
  }
  if ((context.acceptanceCriteria?.length ?? 0) > 0 || (context.expectedBehavior?.length ?? 0) > 0) {
    return "medium";
  }
  return "low";
}

function normalizeStatements(
  values: RequirementStatementInput[] | undefined,
  fallbackSourceIds: string[]
): RequirementStatement[] {
  return (values ?? []).map((value) => normalizeStatement(value, fallbackSourceIds)).filter((value) => value.text);
}

function normalizeStatement(
  value: string | RequirementStatementInput,
  fallbackSourceIds: string[]
): RequirementStatement {
  if (typeof value === "string") {
    return { text: value.trim(), sourceIds: fallbackSourceIds };
  }
  return {
    text: value.text.trim(),
    sourceIds: normalizeSourceIds(value.sourceIds, fallbackSourceIds)
  };
}

function normalizeCriterion(
  value: AcceptanceCriterionInput,
  index: number,
  fallbackSourceIds: string[]
): AcceptanceCriterion {
  if (typeof value === "string") {
    return {
      id: `AC-${index + 1}`,
      text: value.trim(),
      requiredProof: [],
      sourceIds: fallbackSourceIds
    };
  }
  return {
    id: value.id?.trim() || `AC-${index + 1}`,
    text: value.text.trim(),
    requiredProof: (value.requiredProof ?? []).map((proof) => proof.trim()).filter(Boolean),
    sourceIds: normalizeSourceIds(value.sourceIds, fallbackSourceIds)
  };
}

function normalizeSourceIds(sourceIds: string[] | undefined, fallback: string[]): string[] {
  const normalized = [...new Set((sourceIds?.length ? sourceIds : fallback).map((id) => id.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : fallback;
}

function dedupeSources(sources: RequirementSource[]): RequirementSource[] {
  const byId = new Map<string, RequirementSource>();
  for (const source of sources) {
    if (!byId.has(source.id)) {
      byId.set(source.id, source);
    }
  }
  return [...byId.values()];
}
