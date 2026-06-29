import { dedupeStrings } from "@submuxhq/codedecay-core";
import { relativePathForArtifact } from "../../product/generated-tests";
import { slugifyLowerAscii } from "../../product/exploration";
import type { ProductDashboardRun } from "../../renderers/product-dashboard";
import type { ProductTargetStatus } from "../../types";

export function productDashboardRunFromReport(
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

export function dashboardSlug(value: string): string {
  return slugifyLowerAscii(value, "dashboard", 96);
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
