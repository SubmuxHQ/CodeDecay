"use client";

import Image from "next/image";
import { useRef, useState, useSyncExternalStore } from "react";
import type { JudgeLabResult, ReviewState, ScenarioId, ScenarioSummary } from "../lib/contracts";

interface JudgeLabProps {
  engineVersion: string;
  sourceCommit: string;
  scenarios: ScenarioSummary[];
}

const STATES: Array<{ id: ReviewState; label: string }> = [
  { id: "base", label: "Base" },
  { id: "risky", label: "Risky PR" },
  { id: "repaired", label: "Repaired" },
];

const subscribeToHydration = () => () => {};

export function JudgeLab({ engineVersion, sourceCommit, scenarios }: JudgeLabProps) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("auth-api");
  const [reviewState, setReviewState] = useState<ReviewState>("risky");
  const [result, setResult] = useState<JudgeLabResult | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [hasEnteredLab, setHasEnteredLab] = useState(false);
  const activeRequest = useRef(0);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  async function runScenario(nextScenario = scenarioId, nextState = reviewState, enterLab = true) {
    const requestId = ++activeRequest.current;
    setStatus("running");
    setError("");
    if (enterLab) setHasEnteredLab(true);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: nextScenario, state: nextState }),
      });
      const payload = (await response.json()) as JudgeLabResult | { error?: string };
      if (!response.ok || !("scenarioId" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "The analysis endpoint did not respond.",
        );
      }
      if (requestId === activeRequest.current) {
        setResult(payload);
        setStatus("ready");
      }
    } catch (cause) {
      if (requestId === activeRequest.current) {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "The analysis could not be completed.");
      }
    }
  }

  function selectScenario(nextScenario: ScenarioId) {
    setScenarioId(nextScenario);
    const nextState = nextScenario === "clean-decoy" ? "risky" : reviewState;
    if (nextState !== reviewState) setReviewState(nextState);
    if (hasEnteredLab) void runScenario(nextScenario, nextState, false);
  }

  function selectState(nextState: ReviewState) {
    setReviewState(nextState);
    if (hasEnteredLab) void runScenario(scenarioId, nextState, false);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CodeDecay Judge Lab home">
          <Image
            className="brand-mark"
            src="/logo.png"
            alt=""
            width={665}
            height={493}
            aria-hidden="true"
            priority
          />
          <span>CodeDecay</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#lab">Judge Lab</a>
          <a href="#use">Use it</a>
          <a href="#demo">Demo</a>
          <a href="#proof">Proof</a>
          <a href="https://github.com/SubmuxHQ/CodeDecay" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </nav>
        <span className="release-chip">Engine v{engineVersion}</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse" aria-hidden="true" />
            Live, local-first PR red team
          </div>
          <h1>
            Find what your coding agent <em>missed.</em>
          </h1>
          <p className="hero-lede">
            A passing test is not proof. Use this hosted sandbox to see the evidence loop, then run
            the same local-first CLI against your own pull request.
          </p>
          <div className="hero-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => void runScenario("auth-api", "risky")}
              disabled={!isHydrated || status === "running"}
            >
              {status === "running" ? "Running engine…" : "Red-team the risky PR"}
              <span aria-hidden="true">→</span>
            </button>
            <a className="secondary-action" href="#proof">
              See benchmark proof
            </a>
          </div>
          <p className="safe-note">
            No login. No repository upload. Only fixed, inspectable fixtures.
          </p>
        </div>

        <section className="hero-terminal" aria-label="Example merge safety report">
          <div className="terminal-bar">
            <span className="terminal-dots" aria-hidden="true">
              ● ● ●
            </span>
            <span>codedecay redteam</span>
            <span>live</span>
          </div>
          <div className="terminal-body">
            <p>
              <span className="term-muted">$</span> codedecay redteam --format json
            </p>
            <p className="term-ok">
              ✓ diff collected <span>2 files</span>
            </p>
            <p className="term-ok">
              ✓ route mapped <span>GET /api/users</span>
            </p>
            <p className="term-warn">
              ! weak proof <span>route never called</span>
            </p>
            <div className="terminal-finding">
              <span className="danger-dot" aria-hidden="true" />
              <div>
                <strong>Anonymous admin path exposed</strong>
                <p>Auth guard removed from a public route.</p>
              </div>
              <b>HIGH</b>
            </div>
            <div className="score-row">
              <span>merge risk</span>
              <strong>HIGH · BLOCK</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="trust-strip" aria-label="Product assurances">
        <span>OPEN SOURCE</span>
        <span>NO TELEMETRY</span>
        <span>YOUR AGENTS</span>
        <span>REAL TOOL EVIDENCE</span>
        <span>NO HOSTED LLM REQUIRED</span>
      </section>

      <section className="use-section" id="use">
        <div className="section-heading">
          <div>
            <span className="section-number">00 / HOW PEOPLE USE IT</span>
            <h2>The web lab is the proof sandbox. Your repo stays local.</h2>
          </div>
          <p>
            Judge Lab only runs fixed, inspectable fixtures so anyone can test the engine without
            uploading code. Real project review happens from npm, CI, or your own coding agent.
          </p>
        </div>
        <div className="use-grid">
          <article>
            <span className="card-label">TRY IN BROWSER</span>
            <h3>Click the hosted fixture lab.</h3>
            <p>
              Switch a pull request between base, risky, and repaired states. CodeDecay shows the
              changed path, weak proof, edge cases, and repair tasks.
            </p>
            <a href="#lab">Open Judge Lab ↓</a>
          </article>
          <article>
            <span className="card-label">TRY ON YOUR REPO</span>
            <h3>Run the CLI where your code lives.</h3>
            <pre>
              <code>{`npx @submuxhq/codedecay@0.4.1 redteam --base main --head HEAD --format markdown
npx @submuxhq/codedecay@0.4.1 agent --base main --head HEAD`}</code>
            </pre>
            <p>
              This is the real product path: local diff, local checks, no hidden upload, and
              agent-readable tasks for Codex, Claude Code, Cursor, or MCP clients.
            </p>
          </article>
          <article>
            <span className="card-label">AUTOMATE IN CI</span>
            <h3>Add it before merge.</h3>
            <pre>
              <code>{`- uses: SubmuxHQ/CodeDecay/.github/actions/codedecay@v0.4.1
  with:
    base: main
    head: HEAD`}</code>
            </pre>
            <p>
              The GitHub Action turns the same merge-safety checks into review evidence before a
              risky AI-generated change lands.
            </p>
          </article>
        </div>
      </section>

      <section className="lab-section" id="lab">
        <div className="section-heading">
          <div>
            <span className="section-number">01 / JUDGE LAB</span>
            <h2>Don’t trust the green check.</h2>
          </div>
          <p>
            Switch the same PR between base, risky, and repaired states. The risky auth scenario
            executes the release engine on every run.
          </p>
        </div>

        <div className="scenario-picker" role="tablist" aria-label="Curated pull request scenarios">
          {scenarios.map((scenario) => (
            <button
              className={scenarioId === scenario.id ? "scenario active" : "scenario"}
              key={scenario.id}
              type="button"
              role="tab"
              aria-selected={scenarioId === scenario.id}
              onClick={() => selectScenario(scenario.id)}
            >
              <span>{scenario.kicker}</span>
              <strong>{scenario.title}</strong>
              <small>{scenario.mode === "live" ? "Runs live" : "Precomputed evidence"}</small>
            </button>
          ))}
        </div>

        <fieldset className="state-switch">
          <legend className="sr-only">Pull request state</legend>
          {STATES.map((state) => (
            <button
              className={reviewState === state.id ? "active" : ""}
              key={state.id}
              type="button"
              aria-pressed={reviewState === state.id}
              onClick={() => selectState(state.id)}
            >
              {state.label}
            </button>
          ))}
        </fieldset>

        {!hasEnteredLab ? (
          <div className="lab-empty">
            <span className="empty-index">READY / 01</span>
            <h3>One click runs the actual matcher and scoring path.</h3>
            <p>The server accepts only three known fixture IDs and three known states.</p>
            <button
              className="primary-action"
              type="button"
              onClick={() => void runScenario()}
              disabled={!isHydrated}
            >
              Run selected scenario <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null}

        {status === "running" ? (
          <div className="run-status" role="status">
            <span className="spinner" aria-hidden="true" />
            Running deterministic analysis…
          </div>
        ) : null}

        {status === "error" ? (
          <div className="error-state" role="alert">
            <div>
              <strong>Analysis unavailable</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => void runScenario()}>
              Try again
            </button>
          </div>
        ) : null}

        {result && status === "ready" ? <ResultPanel result={result} /> : null}
      </section>

      <section className="demo-section" id="demo">
        <div className="section-heading">
          <div>
            <span className="section-number">02 / GENUINE CODEX REPAIR</span>
            <h2>From false green to real proof.</h2>
          </div>
          <p>
            Watch one sandboxed Codex session reproduce an anonymous admin bypass, add a red
            endpoint test, repair the real path, run approved checks, and self-review the remaining
            risk.
          </p>
        </div>
        <div className="demo-player">
          <video
            controls
            playsInline
            preload="metadata"
            poster="/demo/codedecay-codex-repair-poster.png"
          >
            <source src="/demo/codedecay-codex-repair.mp4" type="video/mp4" />
            <track
              default
              kind="captions"
              label="English"
              src="/demo/codedecay-codex-repair.vtt"
              srcLang="en"
            />
            Your browser does not support HTML video.
          </video>
          <div className="demo-evidence">
            <div>
              <span>REPRODUCIBLE IDENTITY</span>
              <strong>v{engineVersion} · fixture 36a38500031f</strong>
            </div>
            <p>
              Edited for time from one genuine session. Waiting and repeated report output are cut;
              command order and results are preserved.
            </p>
            <div className="demo-links">
              <a
                href={`https://github.com/SubmuxHQ/CodeDecay/blob/${sourceCommit}/docs/hackathon/demo/evidence/run-v3.md`}
                target="_blank"
                rel="noreferrer"
              >
                Evidence index ↗
              </a>
              <a
                href={`https://github.com/SubmuxHQ/CodeDecay/blob/${sourceCommit}/docs/hackathon/demo/cuts.md`}
                target="_blank"
                rel="noreferrer"
              >
                Timing cuts ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-section" id="proof">
        <div className="section-heading">
          <div>
            <span className="section-number">03 / PROOF, NOT PROMISES</span>
            <h2>Grounded claims. Visible limits.</h2>
          </div>
          <p>
            These are deterministic fixture-corpus results, not a claim of production accuracy. Real
            repositories still require human judgment and configured checks.
          </p>
        </div>
        <div className="proof-grid">
          <article>
            <strong>23 / 23</strong>
            <span>planted fixture issues recalled</span>
          </article>
          <article>
            <strong>2.22%</strong>
            <span>false-positive rate in the benchmark corpus</span>
          </article>
          <article>
            <strong>0</strong>
            <span>hidden model calls or telemetry events</span>
          </article>
        </div>
        <div className="provenance">
          <div>
            <span>BUILD IDENTITY</span>
            <code>{sourceCommit.slice(0, 12)}</code>
          </div>
          <p>
            Every result labels deterministic evidence, tool output, repo memory, and Codex
            suggestions separately. This lab currently displays deterministic evidence only.
          </p>
          <a
            href={`https://github.com/SubmuxHQ/CodeDecay/tree/${sourceCommit}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect exact source ↗
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <a className="brand" href="#top">
            <Image
              className="brand-mark"
              src="/logo.png"
              alt=""
              width={665}
              height={493}
              aria-hidden="true"
            />
            <span>CodeDecay</span>
          </a>
          <p>Find what your coding agent missed before merge.</p>
        </div>
        <div className="footer-links">
          <a href="#demo">Demo</a>
          <a href="/api/health">Health</a>
          <a href="https://github.com/SubmuxHQ/CodeDecay/issues/695">Issue #695</a>
          <a href="https://github.com/SubmuxHQ/CodeDecay/blob/main/LICENSE">MIT License</a>
        </div>
      </footer>
    </main>
  );
}

function ResultPanel({ result }: { result: JudgeLabResult }) {
  const scoreClass = `risk-${result.summary.riskLevel}`;
  return (
    <div className="result-shell" data-testid="analysis-result">
      <div className="result-head">
        <div>
          <span className={`mode-badge ${result.execution.mode}`}>
            {result.execution.mode === "live" ? "LIVE EXECUTION" : "PRECOMPUTED EVIDENCE"}
          </span>
          <span className="result-title">
            {result.scenarioKicker} / {result.state}
          </span>
        </div>
        <div className={`risk-score ${scoreClass}`}>
          <span>MERGE RISK</span>
          <strong>{result.summary.riskLevel}</strong>
          <small>{result.summary.mergeRiskScore}/100</small>
        </div>
      </div>

      <div className="provenance-bar">
        <strong>{result.execution.label}</strong>
        <span>v{result.execution.engineVersion}</span>
        <span>
          {result.execution.durationMs === null
            ? "cached artifact"
            : `${result.execution.durationMs}ms`}
        </span>
        <code>{result.execution.sourceCommit.slice(0, 12)}</code>
      </div>

      <div className="diff-grid">
        <CodePanel title="BEFORE" code={result.diff.before} tone="before" />
        <CodePanel title="AFTER" code={result.diff.after} tone="after" />
      </div>

      <div className="evidence-grid">
        <article className="route-card">
          <span className="card-label">IMPACTED PATH</span>
          <h3>{result.impactedRoute.route}</h3>
          <div className="method-row">
            {result.impactedRoute.methods.map((method) => (
              <b key={method}>{method}</b>
            ))}
          </div>
          <p>{result.impactedRoute.userImpact}</p>
        </article>
        <article className="proof-card">
          <span className="card-label">TEST REALITY CHECK</span>
          <h3 className={`proof-${result.testProof.status}`}>
            {result.testProof.status.replace("-", " ")}
          </h3>
          <p>{result.testProof.detail}</p>
        </article>
      </div>

      <div className="findings">
        <div className="list-heading">
          <span className="card-label">EVIDENCE</span>
          <span>
            {result.findings.length} deterministic finding{result.findings.length === 1 ? "" : "s"}
          </span>
        </div>
        {result.findings.length === 0 ? (
          <div className="no-findings">
            <strong>No blocker invented.</strong>
            <p>The deterministic engine found no high-confidence regression or security signal.</p>
          </div>
        ) : (
          result.findings.map((finding) => (
            <article className="finding" key={`${finding.ruleId}-${finding.line ?? 0}`}>
              <span className={`severity ${finding.severity}`}>{finding.severity}</span>
              <div>
                <strong>{finding.title}</strong>
                <p>{finding.detail}</p>
                {finding.file ? (
                  <code>
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </code>
                ) : null}
              </div>
              <span className="evidence-kind">{finding.evidenceKind}</span>
            </article>
          ))
        )}
      </div>

      <div className="action-grid">
        <ActionList index="01" title="Missing edge cases" items={result.edgeCases} />
        <ActionList index="02" title="Agent repair tasks" items={result.repairTasks} />
        <ActionList index="03" title="Verify before merge" items={result.verification} />
      </div>

      <div className="result-footer">
        <p>
          <strong>Recommendation:</strong> {result.summary.recommendation}
        </p>
        <div>
          <a href={result.links.fixture} target="_blank" rel="noreferrer">
            Fixture ↗
          </a>
          <a href={result.links.engine} target="_blank" rel="noreferrer">
            Engine ↗
          </a>
          <a href={result.links.benchmark} target="_blank" rel="noreferrer">
            Benchmark ↗
          </a>
          <a href={result.links.sourceTree} target="_blank" rel="noreferrer">
            Exact source ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function CodePanel({
  title,
  code,
  tone,
}: {
  title: string;
  code: string;
  tone: "before" | "after";
}) {
  return (
    <section className={`code-panel ${tone}`} aria-label={`${title.toLowerCase()} code`}>
      <div>
        <span>{title}</span>
        <code>src diff</code>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </section>
  );
}

function ActionList({ index, title, items }: { index: string; title: string; items: string[] }) {
  return (
    <article>
      <span className="action-index">{index}</span>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
