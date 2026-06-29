import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CODEDECAY_VERSION,
  dedupeStrings,
  productFailureBundlesFromProductTargetReport,
  type ProductFailureBundle
} from "@submuxhq/codedecay-core";
import { priorityRank, relativePathForArtifact } from "../../product/generated-tests";
import {
  renderProductDashboardFailureMarkdown,
  renderProductDashboardHtml,
  type ProductDashboard,
  type ProductDashboardFailure,
  type ProductDashboardRun
} from "../../renderers/product-dashboard";
import type { DashboardOptions } from "../../types";
import { discoverProductDashboardArtifacts, loadProductDashboardReport } from "./artifacts";
import { dashboardSlug, productDashboardRunFromReport } from "./runs";
import { sanitizeProductFailureBundle } from "./sanitization";

export function createProductDashboard(rootDir: string, outputDir: string, options: DashboardOptions): ProductDashboard {
  const artifactPaths = discoverProductDashboardArtifacts(rootDir, options.inputPaths);
  const runs: ProductDashboardRun[] = [];
  const failures: ProductDashboardFailure[] = [];
  const targetIds = new Set<string>();
  const generatedAt = new Date().toISOString();

  for (const artifactPath of artifactPaths) {
    const report = loadProductDashboardReport(artifactPath);
    if (!report) {
      continue;
    }

    const runId = dashboardSlug(relativePathForArtifact(rootDir, artifactPath));
    const run = productDashboardRunFromReport(runId, rootDir, artifactPath, report);
    runs.push(run);
    for (const targetId of run.targets) {
      targetIds.add(targetId);
    }

    for (const bundle of productFailureBundlesFromProductTargetReport(report)) {
      const sanitized = sanitizeProductFailureBundle(bundle);
      const failureId = dashboardSlug(`${runId}-${sanitized.id}`);
      const jsonPath = join("failures", `${failureId}.json`);
      const markdownPath = join("failures", `${failureId}.md`);
      failures.push({
        id: failureId,
        runId,
        title: sanitized.title,
        targetId: sanitized.target.id,
        checkId: sanitized.checkId,
        checkKind: sanitized.checkKind,
        priority: sanitized.priority,
        classification: sanitized.classification,
        classificationConfidence: sanitized.classificationConfidence,
        classificationEvidence: sanitized.classificationEvidence,
        summary: sanitized.summary,
        expected: sanitized.expected,
        actual: sanitized.actual,
        impactedFiles: sanitized.impactedFiles,
        rerunCommand: sanitized.rerunCommand,
        jsonPath,
        markdownPath
      });
      writeProductDashboardFailure(outputDir, jsonPath, markdownPath, sanitized);
    }
  }

  const sortedRuns = runs.sort((left, right) => (right.generatedAt ?? "").localeCompare(left.generatedAt ?? "") || left.id.localeCompare(right.id));
  const sortedFailures = failures.sort((left, right) => {
    const risk = priorityRank(right.priority) - priorityRank(left.priority);
    if (risk !== 0) {
      return risk;
    }

    return left.id.localeCompare(right.id);
  });

  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt,
    outputDir: relativePathForArtifact(rootDir, outputDir),
    summary: {
      runs: sortedRuns.length,
      targets: targetIds.size,
      passed: sortedRuns.reduce((count, run) => count + run.passed, 0),
      failed: sortedRuns.reduce((count, run) => count + run.failed, 0),
      blocked: sortedRuns.reduce((count, run) => count + run.blocked, 0),
      timedOut: sortedRuns.reduce((count, run) => count + run.timedOut, 0),
      skipped: sortedRuns.reduce((count, run) => count + run.skipped, 0),
      failures: sortedFailures.length,
      flaky: sortedFailures.filter((failure) => failure.classification === "likely-flaky").length,
      confirmedRegressions: sortedFailures.filter((failure) => failure.classification === "confirmed-regression").length
    },
    runs: sortedRuns,
    failures: sortedFailures
  };
}

export function writeProductDashboard(outputDir: string, dashboard: ProductDashboard): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDir, "index.html"), renderProductDashboardHtml(dashboard), "utf8");
}

export function resetProductDashboardFailures(outputDir: string): void {
  rmSync(join(outputDir, "failures"), { recursive: true, force: true });
}

function writeProductDashboardFailure(
  outputDir: string,
  jsonPath: string,
  markdownPath: string,
  bundle: ProductFailureBundle
): void {
  mkdirSync(join(outputDir, "failures"), { recursive: true });
  writeFileSync(join(outputDir, jsonPath), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDir, markdownPath), renderProductDashboardFailureMarkdown(bundle), "utf8");
}
