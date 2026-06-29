import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { sarifLevel } from "./level";
import { productFailureRuleId } from "./product-failures";

export function sarifFindingResults(report: CodeDecayReport): Record<string, unknown>[] {
  return report.findings.map((finding) => {
    const result: Record<string, unknown> = {
      ruleId: finding.ruleId,
      level: sarifLevel(finding.severity),
      message: {
        text: `${finding.title}: ${finding.description}`
      }
    };

    if (finding.file) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: {
              uri: finding.file
            },
            region: {
              startLine: finding.line ?? 1
            }
          }
        }
      ];
    }

    return result;
  });
}

export function sarifProductFailureResults(report: CodeDecayReport): Record<string, unknown>[] {
  return (report.productFailureBundles ?? []).map((bundle) => {
    const result: Record<string, unknown> = {
      ruleId: productFailureRuleId(bundle),
      level: sarifLevel(bundle.priority),
      message: {
        text: `${bundle.title}: ${bundle.summary} Rerun: ${bundle.rerunCommand}`
      },
      properties: {
        productFailureBundleId: bundle.id,
        checkId: bundle.checkId,
        checkKind: bundle.checkKind,
        classification: bundle.classification,
        target: bundle.target,
        failedStep: bundle.failedStep,
        artifacts: bundle.artifacts
      }
    };

    const primaryFile = bundle.impactedFiles[0];
    if (primaryFile) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: {
              uri: primaryFile
            },
            region: {
              startLine: 1
            }
          }
        }
      ];
    }

    return result;
  });
}
