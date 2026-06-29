import type { CodeDecayReport, ProductFailureBundle, RiskLevel } from "@submuxhq/codedecay-core";

export function renderSarifReport(report: CodeDecayReport): string {
  const findingRules = [...new Map(report.findings.map((finding) => [finding.ruleId, finding])).values()].map(
    (finding) => ({
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
    })
  );
  const productFailureRules = (report.productFailureBundles ?? []).map((bundle) => ({
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

  const findingResults = report.findings.map((finding) => {
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
  const productFailureResults = (report.productFailureBundles ?? []).map((bundle) => {
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

  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "CodeDecay",
              informationUri: "https://github.com/SubmuxHQ/CodeDecay",
              rules: [...findingRules, ...productFailureRules]
            }
          },
          results: [...findingResults, ...productFailureResults],
          properties: {
            mergeRiskScore: report.summary.mergeRiskScore,
            decayScore: report.summary.decayScore,
            mergeRiskBreakdown: report.summary.mergeRiskBreakdown,
            decayBreakdown: report.summary.decayBreakdown,
            testEvidence: report.testEvidence,
            productFailureBundles: report.productFailureBundles
          }
        }
      ]
    },
    null,
    2
  )}\n`;
}

function productFailureRuleId(bundle: ProductFailureBundle): string {
  return `product-verification/${bundle.checkKind}/${bundle.checkId}`;
}

function sarifLevel(level: RiskLevel): "error" | "warning" | "note" {
  if (level === "high") {
    return "error";
  }

  if (level === "medium") {
    return "warning";
  }

  return "note";
}
