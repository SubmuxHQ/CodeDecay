import type {
  ProductCheckKind,
  ProductFailureBundle,
  ProductFailureClassification,
  RiskLevel
} from "@submuxhq/codedecay-core";
import type { ConfigFormat, ProductTargetStatus } from "../types";

export interface ProductDashboard {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  outputDir: string;
  summary: ProductDashboardSummary;
  runs: ProductDashboardRun[];
  failures: ProductDashboardFailure[];
}

export interface ProductDashboardSummary {
  runs: number;
  targets: number;
  passed: number;
  failed: number;
  blocked: number;
  timedOut: number;
  skipped: number;
  failures: number;
  flaky: number;
  confirmedRegressions: number;
}

export interface ProductDashboardRun {
  id: string;
  sourcePath: string;
  generatedAt?: string | undefined;
  status: ProductTargetStatus;
  durationMs?: number | undefined;
  targets: string[];
  passed: number;
  failed: number;
  blocked: number;
  timedOut: number;
  skipped: number;
}

export interface ProductDashboardFailure {
  id: string;
  runId: string;
  title: string;
  targetId: string;
  checkId: string;
  checkKind: ProductCheckKind;
  priority: RiskLevel;
  classification: ProductFailureClassification;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  summary: string;
  expected: string;
  actual: string;
  impactedFiles: string[];
  rerunCommand: string;
  jsonPath: string;
  markdownPath: string;
}

export function renderProductDashboardSummary(dashboard: ProductDashboard, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(dashboard, null, 2)}\n`;
  }

  return [
    "## CodeDecay Product Dashboard",
    "",
    `Dashboard written to \`${dashboard.outputDir}\`.`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Runs | ${dashboard.summary.runs} |`,
    `| Targets | ${dashboard.summary.targets} |`,
    `| Failures | ${dashboard.summary.failures} |`,
    `| Confirmed regressions | ${dashboard.summary.confirmedRegressions} |`,
    `| Likely flaky | ${dashboard.summary.flaky} |`,
    "",
    dashboard.failures.length > 0 ? "Open `index.html` for failure bundle links and rerun commands." : "No product failures found.",
    ""
  ].join("\n");
}

export function renderProductDashboardHtml(dashboard: ProductDashboard): string {
  const failureRows = dashboard.failures
    .map(
      (failure) => `<tr>
        <td>${escapeHtml(failure.priority)}</td>
        <td>${escapeHtml(failure.classification)}</td>
        <td>${escapeHtml(failure.targetId)}</td>
        <td>${escapeHtml(failure.title)}</td>
        <td><a href="${escapeAttribute(failure.markdownPath)}">Markdown</a> · <a href="${escapeAttribute(failure.jsonPath)}">JSON</a></td>
      </tr>`
    )
    .join("\n");
  const runRows = dashboard.runs
    .map(
      (run) => `<tr>
        <td>${escapeHtml(run.generatedAt ?? "unknown")}</td>
        <td>${escapeHtml(run.status)}</td>
        <td>${escapeHtml(run.targets.join(", ") || "none")}</td>
        <td>${escapeHtml(run.sourcePath)}</td>
      </tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeDecay Product Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #090909; color: #f4f1ec; }
    body { margin: 0; padding: 32px; background: radial-gradient(circle at top left, #24160c, #090909 38%); }
    main { max-width: 1120px; margin: 0 auto; }
    .hero { border: 1px solid #2b2b2b; background: #111; border-radius: 24px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    h1 { margin: 0 0 8px; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: -.05em; }
    .muted { color: #aaa39a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 24px 0; }
    .card { border: 1px solid #2b2b2b; background: #151515; border-radius: 18px; padding: 18px; }
    .num { font-size: 2rem; font-weight: 800; color: #f08a24; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 32px; overflow: hidden; border-radius: 16px; }
    th, td { border-bottom: 1px solid #272727; padding: 12px; text-align: left; vertical-align: top; }
    th { color: #f08a24; background: #111; }
    a { color: #f08a24; }
    code { background: #1c1c1c; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="muted">Generated ${escapeHtml(dashboard.generatedAt)}</p>
      <h1>CodeDecay Product Dashboard</h1>
      <p class="muted">Static product verification history. No backend, telemetry, or hosted service required.</p>
      <div class="grid">
        <div class="card"><div class="num">${dashboard.summary.runs}</div><div>Runs</div></div>
        <div class="card"><div class="num">${dashboard.summary.targets}</div><div>Targets</div></div>
        <div class="card"><div class="num">${dashboard.summary.failures}</div><div>Failures</div></div>
        <div class="card"><div class="num">${dashboard.summary.confirmedRegressions}</div><div>Confirmed regressions</div></div>
        <div class="card"><div class="num">${dashboard.summary.flaky}</div><div>Likely flaky</div></div>
      </div>
    </section>
    <h2>Failures</h2>
    <table>
      <thead><tr><th>Priority</th><th>Classification</th><th>Target</th><th>Title</th><th>Bundle</th></tr></thead>
      <tbody>${failureRows || '<tr><td colspan="5">No product failures found.</td></tr>'}</tbody>
    </table>
    <h2>Runs</h2>
    <table>
      <thead><tr><th>Generated</th><th>Status</th><th>Targets</th><th>Source</th></tr></thead>
      <tbody>${runRows || '<tr><td colspan="4">No product run artifacts found.</td></tr>'}</tbody>
    </table>
  </main>
</body>
</html>
`;
}

export function renderProductDashboardFailureMarkdown(bundle: ProductFailureBundle): string {
  return [
    `# ${bundle.title}`,
    "",
    `- Classification: ${bundle.classification}${bundle.classificationConfidence !== undefined ? ` (${Math.round(bundle.classificationConfidence * 100)}% confidence)` : ""}`,
    `- Priority: ${bundle.priority}`,
    `- Target: ${bundle.target.id}${bundle.target.baseUrl ? ` (${bundle.target.baseUrl})` : ""}`,
    `- Check: ${bundle.checkId} (${bundle.checkKind})`,
    `- Expected: ${bundle.expected}`,
    `- Actual: ${bundle.actual}`,
    `- Rerun: \`${bundle.rerunCommand}\``,
    "",
    "## Evidence",
    "",
    ...(bundle.classificationEvidence ?? ["No classification evidence recorded."]).map((evidence) => `- ${evidence}`),
    "",
    "## Repair Tasks",
    "",
    ...bundle.suggestedFixTasks.map((task) => `- ${task}`),
    ""
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
