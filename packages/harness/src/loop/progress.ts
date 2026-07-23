import type {
  LoopCheckSnapshot,
  LoopCheckStatus,
  LoopRedteamReport
} from "./types";

export interface LoopProgressSnapshot {
  mergeRiskScore: number;
  decayScore: number;
  securityScore: number;
  weakTestFindings: number;
  productFailureBundles: number;
  checksConfigured: boolean;
  checkStatus: LoopCheckStatus;
  failedChecks: number;
  skippedChecks: number;
  timedOutChecks: number;
  errorChecks: number;
}

export function createLoopProgressSnapshot(
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot
): LoopProgressSnapshot {
  return {
    mergeRiskScore: report.summary.mergeRiskScore,
    decayScore: report.summary.decayScore,
    securityScore: report.summary.securityScore,
    weakTestFindings: report.summary.weakTestFindings,
    productFailureBundles: report.summary.productFailureBundles,
    checksConfigured: checks.configured,
    checkStatus: checks.status,
    failedChecks: checks.failed,
    skippedChecks: checks.skipped,
    timedOutChecks: checks.timedOut,
    errorChecks: checks.errors
  };
}

export function didLoopEvidenceImprove(
  previous: LoopProgressSnapshot,
  current: LoopProgressSnapshot
): boolean {
  return current.mergeRiskScore < previous.mergeRiskScore ||
    current.decayScore < previous.decayScore ||
    current.securityScore < previous.securityScore ||
    current.weakTestFindings < previous.weakTestFindings ||
    current.productFailureBundles < previous.productFailureBundles ||
    checkPenalty(current) < checkPenalty(previous);
}

function checkPenalty(snapshot: LoopProgressSnapshot): number {
  const statusPenalty: Record<LoopCheckStatus, number> = {
    passed: 0,
    skipped: 1,
    failed: 2,
    timed_out: 3,
    error: 4,
    blocked: 5,
    "not-configured": 6
  };
  const configuredPenalty = snapshot.checksConfigured ? 0 : 1;
  const resultPenalty =
    snapshot.failedChecks * 100 +
    snapshot.timedOutChecks * 100 +
    snapshot.errorChecks * 100 +
    snapshot.skippedChecks;

  return configuredPenalty * 1_000_000 + statusPenalty[snapshot.checkStatus] * 10_000 + resultPenalty;
}
