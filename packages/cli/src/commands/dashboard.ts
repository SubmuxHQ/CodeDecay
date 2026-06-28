import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CODEDECAY_VERSION,
  dedupeStrings,
  productFailureBundlesFromProductTargetReport,
  type ProductFailureBundle,
  type ProductFailureStep
} from "@submuxhq/codedecay-core";
import { write } from "../io";
import { parseDashboardArgs } from "../parsers/args";
import { slugifyLowerAscii } from "../product/exploration";
import { priorityRank, relativePathForArtifact } from "../product/generated-tests";
import {
  renderProductDashboardFailureMarkdown,
  renderProductDashboardHtml,
  renderProductDashboardSummary,
  type ProductDashboard,
  type ProductDashboardFailure,
  type ProductDashboardRun
} from "../renderers/product-dashboard";
import type { CliCommandContext, DashboardOptions, ProductTargetStatus } from "../types";

export interface RunDashboardCommandDependencies {
  resolveRepoRoot(cwd: string, options: { format: string }): string;
}

export function runDashboardCommand(
  context: CliCommandContext,
  dependencies: RunDashboardCommandDependencies
): void {
  const options = parseDashboardArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const outputDir = resolve(cwd, options.output ?? join(".codedecay", "local", "dashboard"));
  resetProductDashboardFailures(outputDir);
  const dashboard = createProductDashboard(rootDir, outputDir, options);

  writeProductDashboard(outputDir, dashboard);
  write(context.runtime.stdout, renderProductDashboardSummary(dashboard, options.format));
}

function createProductDashboard(rootDir: string, outputDir: string, options: DashboardOptions): ProductDashboard {
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

function discoverProductDashboardArtifacts(rootDir: string, inputPaths: string[]): string[] {
  const candidates = [
    join(rootDir, ".codedecay", "local", "product-runs"),
    join(rootDir, ".codedecay", "local", "product-trends"),
    ...inputPaths.map((path) => resolve(rootDir, path))
  ];
  const discovered: string[] = [];

  for (const candidate of candidates) {
    discovered.push(...discoverJsonFiles(candidate));
  }

  return dedupeStrings(discovered.map((path) => resolve(path))).sort((left, right) => left.localeCompare(right));
}

function discoverJsonFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stats = statSync(path);
  if (stats.isFile()) {
    return path.endsWith(".json") ? [path] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      return discoverJsonFiles(child);
    }

    return entry.isFile() && entry.name.endsWith(".json") ? [child] : [];
  });
}

function loadProductDashboardReport(path: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { targets?: unknown }).targets)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function productDashboardRunFromReport(
  runId: string,
  rootDir: string,
  artifactPath: string,
  report: Record<string, unknown>
): ProductDashboardRun {
  const summary = dashboardRecord(report.summary);
  const targets = Array.isArray(report.targets) ? report.targets.map(dashboardRecord).filter(Boolean) : [];
  return {
    id: runId,
    sourcePath: relativePathForArtifact(rootDir, artifactPath),
    generatedAt: dashboardString(report.generatedAt),
    status: productTargetStatusValue(dashboardString(summary?.status)) ?? "skipped",
    durationMs: dashboardNumber(summary?.durationMs),
    targets: dedupeStrings(targets.map((target) => dashboardString(target?.id)).filter((id): id is string => Boolean(id))),
    passed: dashboardNumber(summary?.passed) ?? targets.filter((target) => dashboardString(target?.status) === "passed").length,
    failed: dashboardNumber(summary?.failed) ?? targets.filter((target) => dashboardString(target?.status) === "failed").length,
    blocked: dashboardNumber(summary?.blocked) ?? targets.filter((target) => dashboardString(target?.status) === "blocked").length,
    timedOut: dashboardNumber(summary?.timedOut) ?? targets.filter((target) => dashboardString(target?.status) === "timed_out").length,
    skipped: dashboardNumber(summary?.skipped) ?? targets.filter((target) => dashboardString(target?.status) === "skipped").length
  };
}

function writeProductDashboard(outputDir: string, dashboard: ProductDashboard): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDir, "index.html"), renderProductDashboardHtml(dashboard), "utf8");
}

function resetProductDashboardFailures(outputDir: string): void {
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

function sanitizeProductFailureBundle(bundle: ProductFailureBundle): ProductFailureBundle {
  return {
    ...bundle,
    target: {
      ...bundle.target,
      baseUrl: bundle.target.baseUrl ? sanitizeDashboardUrl(bundle.target.baseUrl) : undefined
    },
    title: redactDashboardText(bundle.title),
    summary: redactDashboardText(bundle.summary),
    failedStep: sanitizeDashboardStep(bundle.failedStep),
    neighboringSteps: bundle.neighboringSteps.map(sanitizeDashboardStep),
    artifacts: bundle.artifacts.map((artifact) => ({
      ...artifact,
      label: artifact.label ? redactDashboardText(artifact.label) : undefined,
      description: artifact.description ? redactDashboardText(artifact.description) : undefined
    })),
    expected: redactDashboardText(bundle.expected),
    actual: redactDashboardText(bundle.actual),
    classificationEvidence: bundle.classificationEvidence?.map(redactDashboardText),
    rootCauseHypothesis: bundle.rootCauseHypothesis ? redactDashboardText(bundle.rootCauseHypothesis) : undefined,
    suggestedFixTasks: bundle.suggestedFixTasks.map(redactDashboardText),
    rerunCommand: redactDashboardText(bundle.rerunCommand)
  };
}

function sanitizeDashboardStep(step: ProductFailureStep): ProductFailureStep {
  return {
    ...step,
    label: redactDashboardText(step.label),
    expected: step.expected ? redactDashboardText(step.expected) : undefined,
    actual: step.actual ? redactDashboardText(step.actual) : undefined
  };
}

function sanitizeDashboardUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

function redactDashboardText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s`)"']+/g, (url) => sanitizeDashboardUrl(url))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(
      /\b(token|access_token|refresh_token|api[_-]?key|secret|password|session|cookie)=([^&\s]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\s+/g, " ")
    .trim();
}

function dashboardRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function dashboardString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function dashboardNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function productTargetStatusValue(value: string | undefined): ProductTargetStatus | undefined {
  return value === "passed" || value === "failed" || value === "skipped" || value === "blocked" || value === "timed_out"
    ? value
    : undefined;
}

function dashboardSlug(value: string): string {
  return slugifyLowerAscii(value, "dashboard", 96);
}
