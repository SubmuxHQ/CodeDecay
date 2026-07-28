import type { RedteamReport } from "@submuxhq/codedecay-redteam";
import type { AgentEvidence, AgentFindingEvidence } from "../types";

export function createAgentEvidence(report: RedteamReport): AgentEvidence {
  return {
    changedFiles: report.analysis.changedFiles.map((file) => ({
      path: file.path,
      status: file.status
    })),
    impactedAreas: report.analysis.impactedAreas.map((area) => ({
      kind: area.kind,
      name: area.name,
      risk: area.risk,
      files: [...area.files]
    })),
    impactedRoutes: (report.analysis.impactedRoutes ?? []).map((route) => ({
      framework: route.framework,
      kind: route.kind,
      route: route.route,
      methods: [...route.methods],
      risk: route.risk,
      files: [...route.files],
      reasons: [...route.reasons],
      recommendedTests: [...route.recommendedTests]
    })),
    impactGraph: report.analysis.impactGraph
      ? {
          ...report.analysis.impactGraph,
          confidenceCounts: { ...report.analysis.impactGraph.confidenceCounts },
          adapters: report.analysis.impactGraph.adapters.map((adapter) => ({
            ...adapter,
            capabilities: {
              nodeKinds: [...adapter.capabilities.nodeKinds],
              edgeKinds: [...adapter.capabilities.edgeKinds]
            },
            limitations: [...adapter.limitations]
          })),
          limitations: [...report.analysis.impactGraph.limitations]
        }
      : undefined,
    symbolImpacts: (report.analysis.symbolImpacts ?? []).map((impact) => ({
      file: impact.file,
      symbol: impact.symbol,
      exportKind: impact.exportKind,
      line: impact.line,
      importerFiles: [...impact.importerFiles],
      routeFiles: [...impact.routeFiles],
      likelyTests: [...impact.likelyTests],
      reasons: [...impact.reasons]
    })),
    testProofEntries: (report.testAudit.proofMap?.entries ?? []).map((entry) => ({
      file: entry.file,
      symbol: entry.symbol,
      status: entry.status,
      evidence: entry.evidence,
      proof: entry.proof,
      staticReferences: [...entry.staticReferences],
      routeFiles: [...entry.routeFiles],
      weakenedByMocks: [...entry.weakenedByMocks],
      reasons: [...entry.reasons],
      repairTask: entry.repairTask
    })),
    weakTestFindings: report.weakTestFindings.map(findingEvidence),
    missingTestFindings: report.testAudit.missingTestFindings.map(findingEvidence),
    scopeFindings: report.analysis.findings
      .filter((finding) => finding.category === "scope" && !finding.ruleId.startsWith("contract-"))
      .map(findingEvidence),
    contractFindings: report.analysis.findings
      .filter((finding) => finding.ruleId.startsWith("contract-"))
      .map(findingEvidence),
    edgeCases: report.edgeCases.map(cloneEdgeCase),
    edgeCaseOverflow: report.edgeCaseOverflow.map(cloneEdgeCase),
    productFailureBundles: report.analysis.productFailureBundles ? [...report.analysis.productFailureBundles] : [],
    memory: report.memory
  };
}

function cloneEdgeCase(
  edgeCase: RedteamReport["edgeCases"][number]
): RedteamReport["edgeCases"][number] {
  return {
    ...edgeCase,
    downstreamConsumers: [...edgeCase.downstreamConsumers],
    scope: {
      areas: [...edgeCase.scope.areas],
      files: [...edgeCase.scope.files],
      symbols: [...edgeCase.scope.symbols],
      routes: [...edgeCase.scope.routes],
      flows: [...edgeCase.scope.flows],
      requirementIds: [...edgeCase.scope.requirementIds]
    },
    sources: edgeCase.sources.map((source) => ({ ...source })),
    proof: { ...edgeCase.proof }
  };
}

function findingEvidence(finding: RedteamReport["weakTestFindings"][number]): AgentFindingEvidence {
  const evidence: AgentFindingEvidence = {
    title: finding.title,
    severity: finding.severity,
    description: finding.description,
    ruleId: finding.ruleId
  };

  if (finding.file !== undefined) {
    evidence.file = finding.file;
  }

  if (finding.line !== undefined) {
    evidence.line = finding.line;
  }

  return evidence;
}
