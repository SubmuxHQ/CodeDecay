import type { ProductFailureBundle, ProductFailureStep } from "@submuxhq/codedecay-core";

export function sanitizeProductFailureBundle(bundle: ProductFailureBundle): ProductFailureBundle {
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
