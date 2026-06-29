import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { sarifLevel } from "./level";
import { productFailureRuleId } from "./product-failures";

export function sarifFindingRules(report: CodeDecayReport): Record<string, unknown>[] {
  return [...new Map(report.findings.map((finding) => [finding.ruleId, finding])).values()].map((finding) => ({
    id: finding.ruleId,
    name: finding.title,
    shortDescription: {
      text: finding.title
    },
    fullDescription: {
      text: finding.description
    },
    defaultConfiguration: {
      level: sarifLevel(finding.severity)
    }
  }));
}

export function sarifProductFailureRules(report: CodeDecayReport): Record<string, unknown>[] {
  return (report.productFailureBundles ?? []).map((bundle) => ({
    id: productFailureRuleId(bundle),
    name: bundle.title,
    shortDescription: {
      text: bundle.title
    },
    fullDescription: {
      text: bundle.summary
    },
    defaultConfiguration: {
      level: sarifLevel(bundle.priority)
    }
  }));
}
