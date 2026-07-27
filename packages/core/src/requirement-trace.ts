import type { RequirementContext } from "./requirements";
import type { CodeDecayReport } from "./types";
import type {
  RequirementCriterionTrace,
  RequirementTraceAgentSuggestionInput,
  RequirementTraceEvidence,
  RequirementTraceEvidenceKind,
  RequirementTraceExternalEvidence,
  RequirementTraceGraph,
  RequirementTraceStatus
} from "./types/requirement-trace";

const GENERIC_TOKENS = new Set([
  "acceptance", "active", "after", "and", "api", "available", "behavior", "change", "compare", "configuration",
  "contract", "describe", "expected", "integration", "preserves", "proof", "remains", "response",
  "returns", "should", "support", "test", "that", "the", "their", "this", "through", "update", "uses", "with"
]);

export function createRequirementTrace(input: {
  requirements: RequirementContext;
  report: CodeDecayReport;
  externalEvidence?: RequirementTraceExternalEvidence[] | undefined;
  agentSuggestions?: RequirementTraceAgentSuggestionInput[] | undefined;
  edgeCases?: string[] | undefined;
  fixTasks?: Array<{ title: string; detail: string; file?: string | undefined }> | undefined;
}): RequirementTraceGraph {
  const criteria = input.requirements.acceptanceCriteria.map((criterion) => {
    const tokens = traceTokens([criterion.text, ...criterion.requiredProof].join(" "));
    const implementation = implementationFor(tokens, criterion.text, input.requirements, input.report);
    const evidence = implementationEvidence(criterion.id, implementation);
    const implementationFiles = new Set(implementation.files);

    for (const entry of input.report.testProofMap?.entries ?? []) {
      if (implementationFiles.has(entry.file) || entry.routeFiles.some((file) => implementationFiles.has(file))) {
        evidence.push(traceEvidence(
          criterion.id,
          "test-proof",
          entry.status === "proven_by_runtime_coverage" ? "passed" : "missing",
          true,
          "changed-path-test-proof",
          entry.symbol ? `${entry.file}#${entry.symbol}` : entry.file,
          entry.reasons.join(" ") || entry.repairTask,
          { file: entry.file, symbol: entry.symbol }
        ));
      }
    }

    for (const failure of input.report.productFailureBundles ?? []) {
      if (matchesFilesOrText(implementationFiles, tokens, failure.impactedFiles, [
        failure.checkId, failure.title, failure.summary, failure.expected, failure.actual, failure.target.id
      ])) {
        evidence.push(traceEvidence(
          criterion.id,
          "product-failure",
          "failed",
          true,
          "product-check",
          failure.id,
          `${failure.title}: ${failure.summary}`,
          { file: failure.impactedFiles[0] }
        ));
      }
    }

    for (const external of input.externalEvidence ?? []) {
      // Stdout is evidence after a check is matched, but it is too noisy to decide
      // which requirement the check proves (package names alone can overlap).
      if (matchesFilesOrText(implementationFiles, tokens, external.files ?? [], [
        external.name, external.command ?? ""
      ])) {
        evidence.push(traceEvidence(
          criterion.id,
          external.kind,
          external.status,
          external.trusted,
          external.name,
          external.id,
          external.summary,
          { file: external.files?.[0], command: external.command }
        ));
      }
    }

    for (const suggestion of input.agentSuggestions ?? []) {
      if (matchesFilesOrText(implementationFiles, tokens, suggestion.evidence ?? [], [
        suggestion.title, suggestion.detail, ...(suggestion.affectedFlows ?? [])
      ])) {
        evidence.push(traceEvidence(
          criterion.id,
          "agent-suggestion",
          "untrusted",
          false,
          "user-owned-agent",
          suggestion.title,
          suggestion.detail
        ));
      }
    }

    const risks = input.report.findings
      .filter((finding) =>
        (finding.file && implementationFiles.has(finding.file)) ||
        hasTokenOverlap(tokens, traceTokens(`${finding.title} ${finding.description}`))
      )
      .map((finding) => `${finding.severity}: ${finding.title}`);
    const edgeCases = (input.edgeCases ?? [])
      .filter((edgeCase) => hasTokenOverlap(tokens, traceTokens(edgeCase)));

    for (const task of input.fixTasks ?? []) {
      if ((task.file && implementationFiles.has(task.file)) ||
        hasTokenOverlap(tokens, traceTokens(`${task.title} ${task.detail}`))) {
        evidence.push(traceEvidence(
          criterion.id,
          "fix-task",
          "informational",
          true,
          "codedecay-fix-task",
          task.title,
          task.detail,
          { file: task.file }
        ));
      }
    }

    const limitations: string[] = [];
    const dedupedEvidence = dedupeEvidence(evidence);
    const status = statusFor(implementation.files.length + implementation.symbols.length + implementation.routes.length, criterion.requiredProof, dedupedEvidence);
    if (status === "unmapped") {
      const limitation = "No changed file, symbol, route, or affected flow matched this acceptance criterion.";
      limitations.push(limitation);
      dedupedEvidence.push(traceEvidence(
        criterion.id, "limitation", "missing", true, "codedecay-trace", criterion.id, limitation
      ));
    } else if (status === "proof-missing") {
      const limitation = "Implementation candidates were found, but no trusted passing evidence proves the required behavior.";
      limitations.push(limitation);
      dedupedEvidence.push(traceEvidence(
        criterion.id, "limitation", "missing", true, "codedecay-trace", `${criterion.id}:proof`, limitation
      ));
    } else if (status === "needs-human") {
      const limitation = "Only untrusted agent evidence proposes the final behavior; post-change proof is still required.";
      limitations.push(limitation);
      dedupedEvidence.push(traceEvidence(
        criterion.id, "limitation", "untrusted", false, "codedecay-trace", `${criterion.id}:human`, limitation
      ));
    }

    return {
      requirementId: criterion.id,
      text: criterion.text,
      sourceIds: [...criterion.sourceIds],
      requiredProof: [...criterion.requiredProof],
      status,
      implementation,
      risks: [...new Set(risks)].sort(),
      edgeCases: [...new Set(edgeCases)].sort(),
      evidence: dedupeEvidence(dedupedEvidence),
      limitations
    } satisfies RequirementCriterionTrace;
  });

  return {
    schemaVersion: 1,
    criteria,
    summary: {
      total: criteria.length,
      statuses: statusCounts(criteria),
      blockingRequirementIds: criteria
        .filter((criterion) => criterion.status !== "verified")
        .map((criterion) => criterion.requirementId)
        .sort()
    }
  };
}

export function hasBlockingRequirementTrace(trace: RequirementTraceGraph | undefined): boolean {
  return Boolean(trace?.summary.blockingRequirementIds.length);
}

function implementationFor(
  tokens: string[],
  criterionText: string,
  requirements: RequirementContext,
  report: CodeDecayReport
): RequirementCriterionTrace["implementation"] {
  const matchingFlows = requirements.affectedFlows
    .filter((flow) => hasTokenOverlap(tokens, traceTokens(`${flow.name} ${flow.description ?? ""}`)))
    .map((flow) => ({ name: flow.name, kind: flow.kind }));
  const routes = (report.impactedRoutes ?? []).filter((route) =>
    hasTokenOverlap(tokens, traceTokens(`${route.route} ${route.files.join(" ")}`))
  );
  const symbols = (report.symbolImpacts ?? []).filter((symbol) =>
    hasTokenOverlap(tokens, traceTokens(`${symbol.file} ${symbol.symbol} ${symbol.routeFiles.join(" ")}`))
  );
  const files = report.changedFiles
    .filter((file) => hasTokenOverlap(tokens, traceTokens(file.path)))
    .map((file) => file.path);
  for (const route of routes) {
    files.push(...route.files);
  }
  for (const symbol of symbols) {
    files.push(symbol.file);
  }

  return {
    files: [...new Set(files)].sort(),
    symbols: [...new Set(symbols.map((symbol) => `${symbol.file}#${symbol.symbol}`))].sort(),
    routes: [...new Set(routes.map((route) => route.route))].sort(),
    flows: matchingFlows.length === 0 && requirements.acceptanceCriteria.length === 1
      ? requirements.affectedFlows.map((flow) => ({ name: flow.name, kind: flow.kind }))
      : matchingFlows
  };
}

function implementationEvidence(
  requirementId: string,
  implementation: RequirementCriterionTrace["implementation"]
): RequirementTraceEvidence[] {
  return [
    ...implementation.files.map((file) =>
      traceEvidence(requirementId, "implementation-file", "mapping", true, "git-diff", file, `Changed file ${file} matches the criterion.`, { file })),
    ...implementation.symbols.map((symbol) =>
      traceEvidence(requirementId, "implementation-symbol", "mapping", true, "symbol-impact", symbol, `Changed symbol ${symbol} matches the criterion.`)),
    ...implementation.routes.map((route) =>
      traceEvidence(requirementId, "implementation-route", "mapping", true, "route-impact", route, `Impacted route ${route} matches the criterion.`, { route })),
    ...implementation.flows.map((flow) =>
      traceEvidence(requirementId, "affected-flow", "mapping", true, "requirements", flow.name, `Affected ${flow.kind} flow ${flow.name} matches the criterion.`))
  ];
}

function statusFor(
  implementationCount: number,
  requiredProof: string[],
  evidence: RequirementTraceEvidence[]
): RequirementTraceStatus {
  if (implementationCount === 0) {
    return "unmapped";
  }
  if (evidence.some((item) => item.trusted && item.outcome === "failed")) {
    return "proof-failed";
  }
  if (evidence.some((item) => item.trusted && item.outcome === "passed")) {
    return "verified";
  }
  if (requiredProof.length > 0) {
    return "proof-missing";
  }
  if (evidence.some((item) => !item.trusted && item.outcome === "untrusted")) {
    return "needs-human";
  }
  return "implementation-found";
}

function statusCounts(criteria: RequirementCriterionTrace[]): Record<RequirementTraceStatus, number> {
  return {
    unmapped: criteria.filter((item) => item.status === "unmapped").length,
    "implementation-found": criteria.filter((item) => item.status === "implementation-found").length,
    "proof-missing": criteria.filter((item) => item.status === "proof-missing").length,
    "proof-failed": criteria.filter((item) => item.status === "proof-failed").length,
    verified: criteria.filter((item) => item.status === "verified").length,
    "needs-human": criteria.filter((item) => item.status === "needs-human").length
  };
}

function matchesFilesOrText(
  implementationFiles: Set<string>,
  criterionTokens: string[],
  evidenceFiles: string[],
  text: string[]
): boolean {
  return evidenceFiles.some((file) => implementationFiles.has(file)) ||
    hasTokenOverlap(criterionTokens, traceTokens([...evidenceFiles, ...text].join(" ")));
}

function traceTokens(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token)))];
}

function hasTokenOverlap(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((token) => rightSet.has(token));
}

function traceEvidence(
  requirementId: string,
  kind: RequirementTraceEvidenceKind,
  outcome: RequirementTraceEvidence["outcome"],
  trusted: boolean,
  source: string,
  target: string,
  summary: string,
  optional: Pick<RequirementTraceEvidence, "file" | "symbol" | "route" | "command"> = {}
): RequirementTraceEvidence {
  return {
    id: `${requirementId}::${kind}::${target}`,
    kind,
    outcome,
    trusted,
    source,
    target,
    summary,
    ...(optional.file ? { file: optional.file } : {}),
    ...(optional.symbol ? { symbol: optional.symbol } : {}),
    ...(optional.route ? { route: optional.route } : {}),
    ...(optional.command ? { command: optional.command } : {})
  };
}

function dedupeEvidence(evidence: RequirementTraceEvidence[]): RequirementTraceEvidence[] {
  return [...new Map(evidence.map((item) => [item.id, item])).values()].sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.target.localeCompare(right.target)
  );
}
