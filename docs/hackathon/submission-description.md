# CodeDecay

**Track:** Building Evals
**Team:** SubmuxHQ — Kunal Dhongade
**Tagline:** Find what your coding agent missed before merge.

CodeDecay is an open-source AI orchestration layer that red-teams AI-generated
pull requests before merge. It uses the developer's own coding agents and
open-source tools to find missed bugs, weak tests, edge cases, and user-facing
regressions, then gives evidence-grounded repair and verification tasks back to
the agent.

## Public links

- **Judge Lab:** [Open the public lab](https://codedecay-judge-lab.kunal277075.chatgpt.site)
- **Source:** [View the public repository](https://github.com/SubmuxHQ/CodeDecay)
- **Current public package:** [View the npm package](https://www.npmjs.com/package/@submuxhq/codedecay)
- **Current public release:** [View v0.3.5](https://github.com/SubmuxHQ/CodeDecay/releases/tag/v0.3.5)
- **Benchmark method and limitations:** [Read the benchmark corpus documentation](https://github.com/SubmuxHQ/CodeDecay/blob/main/docs/benchmark-corpus.md)
- **Hackathon workstream:** [Review milestone epic #694](https://github.com/SubmuxHQ/CodeDecay/issues/694)

The immutable hackathon release, public video, public Google Doc URL, and final
BlockseBlock confirmation are release gates tracked in
[#698](https://github.com/SubmuxHQ/CodeDecay/issues/698),
[#696](https://github.com/SubmuxHQ/CodeDecay/issues/696), and
[#699](https://github.com/SubmuxHQ/CodeDecay/issues/699). The submission must
not be finalized until those links point to the same frozen release identity.

## 1. The problem

AI coding agents make it easy to create a plausible implementation and a green
test suite. They also make it easy to merge code nobody deeply reviewed. A
narrow AI-generated test may mock the exact module that changed, copy the
implementation into its oracle, or prove only a helper while the public API
route remains broken.

The affected user is a developer or small team using Codex, Claude Code,
Cursor, or another agent to ship software faster. The failure mode is not that
the agent wrote code. The failure mode is false confidence: the diff looks
reasonable, a test exists, and the green check does not prove the real
production path.

### Concrete user story

An agent changes `GET /api/users`. Its shallow session test passes, but the
route no longer enforces authentication and a new request-controlled SQL query
is unsafe. A real anonymous visitor can reach an admin-shaped response.

CodeDecay maps the changed route, distinguishes the shallow test from real
route proof, reports deterministic security evidence, names missing edge cases,
and gives Codex concrete repair tasks. Codex restores the guard, validates
input, adds a route-level regression test, runs approved checks, and reruns
CodeDecay against the repaired tree.

## 2. Why passing tests create false confidence

A test file is not automatically behavioral proof. CodeDecay's test reality
check looks for signals such as:

- the changed test mocks the changed production module;
- the test copies implementation statements into its expected value;
- assertions inspect SQL or source shape instead of executing the database or
  API boundary;
- only a happy path is covered;
- no test calls the changed API, UI, or downstream consumer;
- many mocks create green output while little real code executes.

The report does not claim that every flagged test is wrong. It says the test
may not prove the changed production path and recommends stronger evidence,
such as a real endpoint call, mutation check, browser flow, or configured
integration test.

## 3. End-to-end workflow

1. **Preflight:** `codedecay ai preflight` turns a requirement into
   repository-grounded likely files, routes, constraints, ambiguity questions,
   and proof expectations before an agent edits code.
2. **Diff and context:** CodeDecay collects the git change, impact map, local
   repository memory, and repo-local review skills.
3. **Deterministic evidence:** analyzers and test audits identify changed
   boundaries, weak proof, security candidates, missing coverage, and
   behavior-specific edge cases.
4. **Optional tool and agent evidence:** explicit user-owned integrations can
   add OSS tool output or Codex investigation. No hidden model call is made.
5. **Repair handoff:** CodeDecay packages findings, limitations, safety notes,
   and prioritized tasks for Codex or another coding agent.
6. **Approved execution:** `codedecay ai --with-checks` runs only configured
   commands and adapters through CodeDecay's safety boundary.
7. **Revalidation:** the repaired current tree is analyzed again. Findings and
   verification status are reported without declaring guaranteed safety.

In shorthand:

```text
requirement -> preflight -> diff -> context -> evidence -> Codex repair
            -> configured checks -> current-tree revalidation
```

## 4. Architecture and technical stack

CodeDecay is a TypeScript and Node.js monorepo built with pnpm, tsup, Vitest,
and GitHub Actions. The CLI package is `@submuxhq/codedecay`; the binary is
`codedecay`.

The architecture keeps orchestration boundaries explicit:

- **Git and core:** collect normalized changes, assemble findings, score risk,
  and preserve evidence types.
- **JavaScript analyzer and test audit:** find deterministic JS/TS impact,
  security, weak-test, and missing-proof signals.
- **Agent and red-team packages:** create preflight briefs, evidence bundles,
  repair tasks, and merge-safety reports.
- **Execution and tool adapters:** run only configured commands and normalize
  OSS output from tools such as Semgrep, Playwright, coverage, or StrykerJS when
  users configure them.
- **MCP and GitHub Action:** expose the same local-first workflow to Codex and
  CI.
- **Memory and skills:** load inspectable local repository knowledge without
  treating memory as trusted executable instruction.
- **Judge Lab:** a vinext/React Cloudflare Worker application that exposes only
  fixed scenario IDs and states. It accepts no repository URL, prompt, command,
  upload, or model credential.

Outputs are available as JSON, Markdown, and SARIF. The open-source CLI remains
useful without a hosted CodeDecay service.

## 5. What Codex planned, executed, and self-reviewed

Codex was used as an agentic engineering collaborator rather than autocomplete.
Public issues and pull requests show the loop:

- it decomposed the deadline into a milestone, viability app, demo, release,
  and submission evidence workstreams;
- it implemented the recommended `codedecay ai` and `ai preflight` surfaces;
- it added packed CLI and GitHub Action acceptance proof;
- it diagnosed and fixed a full-suite benchmark timeout rather than hiding the
  flaky test;
- it built, tested, deployed, and anonymously smoke-tested the Judge Lab;
- it ran CodeDecay's own red-team workflow against the app and replaced a
  hardcoded weak-test result with a reproducible full-analyzer artifact;
- it found and fixed a clean-checkout CI dependency gap;
- it inspected production worker evidence and fixed the remaining favicon
  request miss;
- it reran lint, typecheck, API tests, browser tests, accessibility checks,
  audit, build, packaging, and child-repository acceptance before merge.

The public evidence ledger records the issue, components, checks, decisions,
commit or pull request, and remaining limitation for each contribution:
[originality-ledger.md](./originality-ledger.md).

## 6. Evidence types and trust boundaries

CodeDecay separates:

- **Deterministic evidence:** diff facts, route mappings, test-audit signals,
  matcher findings, and score inputs produced by local code.
- **Tool evidence:** actual output from configured tests, browsers, coverage,
  security scanners, or other adapters.
- **Repository memory:** inspectable local context that may guide review but is
  never executable proof.
- **Codex suggestions:** hypotheses, repair ideas, and investigation guidance
  from the user's agent. These remain unverified until current-tree evidence
  supports them.

The Judge Lab currently displays deterministic evidence only. Its weak-test
scenario is clearly labeled precomputed because the full analyzer requires a
repository filesystem; the checked-in artifact has a reproducible generator
and CI drift check. The auth/API and clean-decoy scenarios execute the release
matcher and scoring path on demand.

## 7. OSS-first integrations

CodeDecay does not try to rebuild every analyzer, test runner, browser, fuzzer,
or security scanner. Its role is orchestration, normalization, evidence
mapping, risk synthesis, memory, and agent handoff.

The adapter direction includes:

- MCP and stable local CLIs for agent integration;
- Ollama for local models and LiteLLM-compatible routing for explicit BYOK;
- TypeScript compiler or language-native parsers for source structure;
- ESLint, Biome, oxlint, Knip, dependency-cruiser, and Madge for JS/TS quality;
- Semgrep, Gitleaks, OSV-Scanner, Trivy, and package-manager audits for
  security evidence;
- Playwright for real user flows;
- StrykerJS for mutation testing;
- Schemathesis and Pact for API and contract proof;
- Vitest, Jest, Pytest, Go, Cargo, and coverage formats for existing project
  checks, plus native git and worktrees for base/head comparison.

Adapters are explicit, safe-configured, machine-readable where possible, and
degrade cleanly when an external tool is not installed.

## 8. Reproducible evaluation evidence

The public deterministic corpus currently reports:

- **23 of 23 planted fixture issues recalled;**
- **2.22% false-positive rate on the fixture corpus;**
- **$0 benchmark model cost;**
- **no model calls;**
- **no telemetry.**

Run:

```bash
codedecay benchmark
codedecay benchmark --format json
```

For a source checkout:

```bash
pnpm eval:benchmark
pnpm eval:pr-safety -- --run-id submission
```

These are deterministic fixture-corpus results, not production accuracy. The
false positives are intentionally visible. The larger paired real-agent
outcome benchmark in
[#683](https://github.com/SubmuxHQ/CodeDecay/issues/683) remains open; therefore
this submission does not claim that CodeDecay always improves agent outcomes,
is equivalent to a staff engineer, or guarantees a safe merge.

## 9. Privacy and safety model

- local-first by default;
- no required CodeDecay API key;
- no hidden model or provider call;
- no hidden telemetry;
- no private code upload unless the user explicitly configures an external
  provider;
- user-owned Codex, Claude Code, Cursor, local, or BYOK integrations;
- explicit safety gates, timeouts, and allowlists for commands;
- no arbitrary command accepted by the Judge Lab;
- deterministic and tool evidence kept distinct from suggestions;
- memory is inspectable, editable, and never trusted as executable instruction.

CodeDecay helps find missed risk. It does not guarantee perfect safety.

## 10. Originality and hackathon-period contribution

The repository and v0.3.5 release existed before this submission sprint. The
pre-existing foundation included the open-source CLI, deterministic analysis,
red-team reports, local memory and skills, configured execution, MCP, GitHub
Action, reports, and fixture benchmark.

Hackathon-period work on 27 July 2026 added or hardened the judge-facing
submission slice:

- stable benchmark identity in the full suite;
- recommended AI-first CLI and Action workflow;
- packed CLI and shell-level Action acceptance;
- explicit investigation/verification grounding;
- public credential-free Judge Lab;
- reproducible weak-test evidence and production acceptance;
- submission, demo, and release evidence workstreams.

This distinction is intentional. The submission claims an original
orchestration approach and meaningful Codex-built work during the hackathon,
not that every line in the mature repository was created during the event.

## 11. Known limitations

- deterministic findings are conservative signals and can produce false
  positives;
- the public corpus is planted and finite;
- a high score is not proof of a bug, and a low score is not proof of safety;
- deeper runtime confidence depends on the repository's configured checks and
  available OSS adapters;
- optional model investigation can be wrong and remains suggestion evidence;
- framework and language coverage is incomplete;
- the controlled paired agent-outcome benchmark in #683 is not complete;
- independent three-participant published-workflow UAT in
  [#692](https://github.com/SubmuxHQ/CodeDecay/issues/692) is not complete.

For the hackathon viability gate, the Judge Lab has deterministic API and
browser acceptance, anonymous production smoke, security headers, accessibility
checks, and a clean-decoy calibration path. That does not substitute for the
broader real-agent evaluation or independent human UAT, which remain public
follow-up work.

## 12. Reproduce the submission candidate

From a clean checkout of the frozen candidate:

```bash
./.codedecay/setup.local.sh
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @submuxhq/codedecay pack --dry-run
pnpm eval:benchmark
pnpm eval:pr-safety -- --run-id submission
node scripts/child-repo-e2e.mjs --run-id submission
```

Judge Lab:

```bash
cd judge-lab
npm ci --ignore-scripts
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

Published-package proof and the immutable tag, package integrity, release URL,
and final source SHA are produced by
[#698](https://github.com/SubmuxHQ/CodeDecay/issues/698). Do not substitute a
workspace build for that final fresh-install check.

## 13. Judge path

1. Open the public Judge Lab without credentials.
2. Select **Broken auth / API PR** and **Risky PR**.
3. Click **Red-team the risky PR**.
4. Inspect the 78/100 high-risk result, three deterministic findings, impacted
   route, weak proof, edge cases, repair tasks, and exact source links.
5. Switch to **Repaired** and compare the stronger route proof.
6. Select the **Clean decoy** to confirm the lab does not invent high risk for a
   documentation-only change.
7. Follow the source, package, release, benchmark, and video links to the same
   frozen release identity before judging.

The core claim is narrow and testable: CodeDecay helps Codex ask what the coding
agent missed, what could break for a real user, whether the real path was
tested, and what must be fixed and revalidated before merge.
