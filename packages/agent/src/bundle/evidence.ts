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
    weakTestFindings: report.weakTestFindings.map(findingEvidence),
    missingTestFindings: report.testAudit.missingTestFindings.map(findingEvidence),
    edgeCases: [...report.edgeCases],
    productFailureBundles: report.analysis.productFailureBundles ? [...report.analysis.productFailureBundles] : [],
    memory: report.memory
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
