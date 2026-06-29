import { escapeAttribute, escapeHtml } from "./escape";
import type { ProductDashboard, ProductDashboardFailure, ProductDashboardRun } from "./types";

export function renderProductDashboardHtml(dashboard: ProductDashboard): string {
  const failureRows = dashboard.failures.map(renderFailureRow).join("\n");
  const runRows = dashboard.runs.map(renderRunRow).join("\n");

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

function renderFailureRow(failure: ProductDashboardFailure): string {
  return `<tr>
        <td>${escapeHtml(failure.priority)}</td>
        <td>${escapeHtml(failure.classification)}</td>
        <td>${escapeHtml(failure.targetId)}</td>
        <td>${escapeHtml(failure.title)}</td>
        <td><a href="${escapeAttribute(failure.markdownPath)}">Markdown</a> · <a href="${escapeAttribute(failure.jsonPath)}">JSON</a></td>
      </tr>`;
}

function renderRunRow(run: ProductDashboardRun): string {
  return `<tr>
        <td>${escapeHtml(run.generatedAt ?? "unknown")}</td>
        <td>${escapeHtml(run.status)}</td>
        <td>${escapeHtml(run.targets.join(", ") || "none")}</td>
        <td>${escapeHtml(run.sourcePath)}</td>
      </tr>`;
}
