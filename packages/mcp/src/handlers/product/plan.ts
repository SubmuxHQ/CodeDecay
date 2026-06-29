import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH, CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { renderProductPlanMarkdown } from "../../product/report";
import { createProductSafety } from "../../product/safety";
import type { McpProductPlanReport } from "../../product/types";
import type { StartMcpServerOptions } from "../../server/types";
import type { ProductToolInput } from "../../tools/types";

export function runProductPlanTool(serverOptions: StartMcpServerOptions, input: ProductToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const targets = Object.values(loadedConfig.config.productTesting.targets)
    .filter((target) => !input.target || target.id === input.target)
    .sort((left, right) => left.id.localeCompare(right.id));
  const plan: McpProductPlanReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "mcp-product-plan",
    generatedAt: new Date().toISOString(),
    configSource: loadedConfig.sourcePath,
    latestReportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
    targets: targets.map((target) => ({
      id: target.id,
      readiness: target.readiness,
      baseUrl: target.readiness.effectiveBaseUrl ?? target.baseUrl,
      healthCheck: target.healthCheck,
      timeoutMs: target.timeoutMs,
      apiEndpoints: target.apiEndpoints.length,
      artifacts: {
        flowMap: `.codedecay/local/product-flow-maps/${target.id}/flow-map.json`,
        generatedUiTests: `.codedecay/local/generated-tests/${target.id}/manifest.json`,
        generatedApiTests: `.codedecay/local/generated-api-tests/${target.id}/manifest.json`
      },
      suggestedCommands: [
        `npx codedecay product --target ${target.id} --format markdown`,
        `npx codedecay product --target ${target.id} --generate-api-tests --run-generated-api-tests --format markdown`,
        `npx codedecay product --target ${target.id} --run-generated-tests --test-id <generated-test-id> --format markdown`
      ]
    })),
    safety: createProductSafety(loadedConfig, false, [
      "This plan is report-only and does not run product target commands.",
      "Use codedecay_product_run with confirmExecution=true to run fixed product verification commands."
    ])
  };

  if (input.format === "json") {
    return `${JSON.stringify(plan, null, 2)}\n`;
  }

  return renderProductPlanMarkdown(plan);
}
