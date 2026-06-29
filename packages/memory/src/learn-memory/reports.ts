import { isPlainObject } from "../schema";

export function collectLearnedReports(object: Record<string, unknown>): Record<string, unknown>[] {
  return [
    ...normalizeReportArray(object.reports),
    ...normalizeReportArray(object.codeDecayReports),
    ...normalizeReportArray(object.failOnReports),
    ...normalizeReportArray(object.blockedReports)
  ];
}

export function collectLearnedProductReports(object: Record<string, unknown>): Record<string, unknown>[] {
  return [
    ...normalizeReportArray(object.productReports),
    ...normalizeReportArray(object.productVerificationReports),
    ...normalizeReportArray(object.productTargetReports),
    ...normalizeReportArray(object.reports),
    ...normalizeReportArray(object.codeDecayReports),
    ...normalizeReportArray(object.failOnReports),
    ...normalizeReportArray(object.blockedReports)
  ].filter(isProductTargetReportLike);
}

export function normalizeReportArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => isPlainObject(item));
}

export function isCodeDecayReportLike(value: Record<string, unknown>): boolean {
  return value.tool === "CodeDecay" && Array.isArray(value.findings);
}

export function isProductTargetReportLike(value: Record<string, unknown>): boolean {
  return value.tool === "CodeDecay" && Array.isArray(value.targets);
}
