# CodeDecay

[![CI](https://github.com/SubmuxHQ/CodeDecay/actions/workflows/ci.yml/badge.svg)](https://github.com/SubmuxHQ/CodeDecay/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@submuxhq/codedecay?label=npm)](https://www.npmjs.com/package/@submuxhq/codedecay)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Catch what your AI coding agent missed — free, in CI, before merge.

CodeDecay is an open-source, deterministic, local-first CLI and GitHub Action
for AI-assisted PR safety. It catches weak or fake-looking tests, regression
risk, maintainability decay, and changed product areas before they reach main.

It is not a generic AI code reviewer and it is not an AI-authorship detector.
CodeDecay asks a narrower, more useful question:

```text
What could this PR break, and are the tests actually proving it won't?
```

<!-- BENCHMARK:START -->
## Catch what your AI coding agent missed — free, in CI, before merge.

Latest reproducible benchmark: **18/18 planted issues caught (100.0% recall)**, **5.56% false-positive rate** on clean decoys, **$0.00 cost**, LLM called: **no**, telemetry sent: **no**.

```bash
npx codedecay analyze
```

Generated from `codedecay benchmark --format json` by `pnpm gen:launch`.
<!-- BENCHMARK:END -->

## Why CodeDecay

AI coding agents can produce code that compiles, passes local happy-path tests,
and still breaks another product flow. CodeDecay gives developers and their
agents a structured merge-safety pass:

- map changed files to likely impacted APIs, routes, modules, config, auth, and
  data/schema areas
- score merge risk and maintainability decay
- flag missing tests and weak or fake-looking test evidence
- suggest edge cases and stronger checks
- package evidence for Codex, Claude Code, Cursor, Pi, OpenCode, desktop
  agents, or MCP-compatible workflows
- run explicitly configured local checks when the user allows execution
- compare base/head behavior through configured probes

CodeDecay is useful by itself in deterministic mode. Optional agent, LLM,
memory, and tool integrations must be user-owned and explicit.

Under the hood, CodeDecay is growing into a PR red-team orchestration platform:
blast-radius mapping, local repo memory, security matchers, OSS tool adapters,
MCP, and agent handoff. The headline stays narrow because the immediate job is
merge safety: find what the coding agent missed, then give reviewers and agents
evidence they can act on.

## Safety Model

The default OSS workflow is intentionally conservative:

| Property | Default |
| --- | --- |
| Telemetry | No |
| CodeDecayCloud dependency | No |
| Required API keys | No |
| Required LLM/model calls | No |
| Hidden agent calls | No |
| Hidden command execution | No |
| Deterministic analysis | Yes |

Commands run only through explicit configuration and safety gates. Agent output
is treated as suggestions, not trusted evidence.

## Install

```bash
npm install -D @submuxhq/codedecay
```

Run it with `npx codedecay` or add it to an npm script.

```bash
npx codedecay --help
```

For source checkout development:

```bash
pnpm install
pnpm build
pnpm test
```

Run the docs site locally:

```bash
pnpm docs:dev
```

## Quickstart

Analyze the current working tree:

```bash
npx codedecay analyze --format markdown
```

Analyze a pull request range:

```bash
npx codedecay analyze --base main --head HEAD --format markdown
```

Generate a red-team report:

```bash
npx codedecay redteam --base main --head HEAD --format markdown
```

Create a task bundle for your coding agent:

```bash
npx codedecay agent --profile codex --base main --head HEAD --format markdown
```

Fail CI on high-risk PRs:

```bash
npx codedecay analyze --base main --head HEAD --fail-on high
```

Persist a stable trend snapshot:

```bash
npx codedecay snapshot --format json --output .codedecay/snapshot.json
```

Preview imported repo memory from incidents or CI learnings:

```bash
npx codedecay memory-import --input incidents.json
npx codedecay memory-learn --input ci-failure.json
```

Run an explicit optional LLM-assisted review:

```bash
npx codedecay llm-review --ping
npx codedecay llm-review --base main --head HEAD --format markdown
```

Check configured live app product targets:

```bash
npx codedecay product --format markdown
npx codedecay product --target web --explore --max-pages 5 --format markdown
npx codedecay product --target web --generate-tests --run-generated-tests --format markdown
```

## Commands

| Command | Purpose |
| --- | --- |
| `codedecay analyze` | Deterministic PR risk, impact, and decay analysis. |
| `codedecay snapshot` | Emit a stable repository health snapshot and compare it with a previous snapshot artifact. |
| `codedecay redteam` | Merge-safety report with impact, weak-test evidence, edge cases, memory, skills, and fix tasks. |
| `codedecay llm-review` | Explicit opt-in LLM-assisted review suggestions grounded in deterministic CodeDecay analysis. |
| `codedecay agent` | Portable task bundle for user-owned agents such as Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients. |
| `codedecay doctor` | Recommend OSS tools and local setup for stronger PR safety evidence without installing or running anything. |
| `codedecay config` | Inspect normalized CodeDecay config. |
| `codedecay memory` | Inspect local repo memory from `.codedecay/memory.json`. |
| `codedecay memory-import` | Preview or apply structured learnings into `.codedecay/memory.json`. |
| `codedecay memory-learn` | Learn local memory from CI, PR, and CodeDecay report signals. |
| `codedecay execute` | Run explicitly configured local commands and OSS tool adapters. |
| `codedecay differential` | Run configured probes on base and head and compare behavior. |
| `codedecay product` | Check live app targets, crawl product flows, and generate reviewable Playwright regressions. |
| `codedecay mcp` | Start a local MCP server for agent clients. |
| `codedecay help` | Show root or per-command help. |
| `codedecay man` | Show a longer manual page for a command. |
| `codedecay update` | Print or apply the recommended upgrade command. |
| `codedecay uninstall` | Print or apply the recommended uninstall and cleanup plan. |
| `codedecay version` | Print the installed CLI version. |

Common flags:

| Flag | Meaning |
| --- | --- |
| `--base <ref>` | Base git ref to compare from. |
| `--head <ref>` | Head git ref to compare to. |
| `--cwd <path>` | Repository working directory to analyze. |
| `--format json\|markdown\|sarif` | Output format. SARIF is supported by `analyze`. |
| `--output <path>` | Write output to a file instead of stdout. Relative paths resolve from `--cwd`. |
| `--fail-on low\|medium\|high` | Exit non-zero when the risk level reaches the threshold. |
| `--profile generic\|codex\|claude-code\|cursor\|pi\|opencode\|desktop` | Agent handoff profile for `codedecay agent`. |

Exit codes:

| Code | Meaning |
| ---: | --- |
| `0` | Command succeeded and risk is below `--fail-on`, if provided. |
| `1` | Analysis succeeded but risk met the `--fail-on` threshold, or configured execution checks failed. |
| `2` | CLI/internal error, invalid git refs, invalid config, or non-git directory. |

Utility examples:

```bash
codedecay help analyze
codedecay llm-review --ping
codedecay man redteam
codedecay version
codedecay update
codedecay uninstall --purge-local
```

## Deterministic By Default

| Workflow | Default | What it does today |
| --- | --- | --- |
| `codedecay analyze`, `redteam`, `agent`, `snapshot` | Yes | Runs deterministic local analysis with no model calls. |
| `codedecay execute`, `differential` | No | Runs only repo-allowlisted local commands after explicit opt-in. |
| `codedecay product --explore` | No | Uses a project-provided Playwright install to crawl configured live app targets after explicit opt-in. |
| `codedecay llm-review` | No | Calls a user-owned provider only when the user invokes it directly. |
| Optional LLM providers | No | Disabled by default. User-owned providers are configured explicitly and only commands that opt in may call them. |

## GitHub Action

```yaml
name: CodeDecay

on:
  pull_request:

jobs:
  codedecay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: SubmuxHQ/CodeDecay/packages/github-action@v0
        with:
          mode: redteam
          base: ${{ github.event.pull_request.base.sha }}
          head: ${{ github.event.pull_request.head.sha }}
          cwd: .
          format: markdown
```

The action writes a GitHub Step Summary. Use `mode: analyze` with
`fail-on: high` for a hard deterministic CI gate, or add `fail-on` to `redteam`
only when you want redteam risk scoring to block the workflow.

See [GitHub Action docs](docs/github-action.md) for output paths, SARIF usage,
and non-root `cwd` examples.

## Output Formats

CodeDecay can render:

- Markdown for local review, PR comments, and GitHub Step Summary
- JSON for automation and downstream tools
- SARIF for GitHub code-scanning upload from `codedecay analyze`

Sample reports:

- [Markdown sample](docs/sample-reports/sample-report.md)
- [JSON sample](docs/sample-reports/sample-report.json)
- [SARIF sample](docs/sample-reports/sample-report.sarif)

## What CodeDecay Detects

Current JS/TS analyzer signals include:

- API route changes
- UI route changes
- transitive route/API impact through local import chains
- auth, session, and security-sensitive files
- database/schema files such as `prisma/schema.prisma`
- config, build, deployment, and runtime files
- broad unrelated PR scope
- large functions and complexity growth
- duplicated logic
- test bloat
- fragile abstractions
- weak tests, missing nearby tests, and low-confidence test evidence

Reports also include language/parser coverage. JavaScript and TypeScript files
use the current parser-backed analyzer. Limited languages such as Python are
still represented for path, diff, coverage, and test-audit signals, but report
their parser limitations until dedicated adapters are added.

The analyzer is intentionally conservative. Findings are review signals, not
guarantees that a bug exists or that a fix is safe.

## Red-Team Workflow

Use the red-team workflow when reviewing AI-assisted PRs:

```bash
npx codedecay redteam --base main --head HEAD --format markdown --output codedecay-redteam.md
npx codedecay agent --profile codex --base main --head HEAD --format markdown --output codedecay-agent.md
```

Then give `codedecay-agent.md` to your preferred agent and ask it to:

1. inspect the changed files and impacted routes/APIs
2. explain what real user/API/database path could break
3. add tests that exercise the real path, not only mocked helper behavior
4. cover missing edge cases
5. run relevant configured checks
6. rerun CodeDecay

The agent bundle is local evidence plus instructions. CodeDecay does not call
Codex, Claude Code, Cursor, Pi, OpenCode, Ollama, cloud models, or CodeDecayCloud
while creating it.

## MCP Server

CodeDecay can run as a local Model Context Protocol server:

```bash
npx @submuxhq/codedecay mcp --cwd /path/to/repo
```

Example client config:

```json
{
  "mcpServers": {
    "codedecay": {
      "command": "npx",
      "args": ["-y", "@submuxhq/codedecay", "mcp", "--cwd", "/path/to/repo"]
    }
  }
}
```

The MCP server exposes tools for PR analysis, impact maps, test audits,
edge-case suggestions, OSS tool recommendations, pattern-pack context,
red-team reports, agent task bundles, and confirmed configured checks.

See [MCP docs](docs/mcp.md).

## OSS Tool Discovery

CodeDecay should reuse mature open-source tools instead of rebuilding every
scanner, fuzzer, mutation tester, browser runner, or supply-chain check.

```bash
npx codedecay doctor
npx codedecay doctor --write-config-preview
```

`doctor` only reads local files. It does not install tools, execute commands,
call models, use network access, or edit `.codedecay/config.yml`. The optional
preview is written to `.codedecay/local/config-preview.yml` for review.

## Configuration

CodeDecay looks for config in:

```text
.codedecay/config.yml
.codedecay/config.yaml
codedecay.config.yml
codedecay.config.yaml
```

Example:

```yaml
version: 1

safety:
  allowCommands: true
  commandTimeoutMs: 120000

commands:
  test:
    - pnpm test
  build:
    - pnpm build

toolAdapters:
  agentProcess:
    command: node scripts/local-agent-harness.js
    profile: codex
    bundleFormat: markdown
  playwright:
    enabled: true
    command: pnpm exec playwright test
  coverage:
    command: pnpm test -- --coverage
    reportPaths:
      - coverage/coverage-final.json
    failOn: uncovered
  semgrep:
    config: .semgrep.yml
    failOnSeverity: high
  stryker:
    enabled: false
```

See [Configuration](docs/configuration.md), [Execution](docs/execution.md), and
[Tool adapters](docs/tool-adapters.md).

## Scoring

Risk levels:

| Score | Level |
| ---: | --- |
| `0-39` | Low |
| `40-69` | Medium |
| `70-100` | High |

Reports include:

- `mergeRiskScore`: immediate regression/blast-radius risk
- `decayScore`: maintainability decay risk
- `mergeRiskBreakdown` and `decayBreakdown`: top contributors, evidence type,
  and any dampeners
- `testEvidence`: whether test coverage signals are heuristic-only or
  runtime-backed
- grouped low/medium/high findings
- impacted areas and routes/APIs
- recommended tests and checks

See [Scoring model](docs/scoring.md) and
[Benchmark corpus](docs/benchmark-corpus.md).

## Compatibility

CodeDecay is still pre-`1.0`. The CLI command names and repo-local config file
shape aim to stay stable within a minor line, but report fields can still grow
before `v1`. Pin CI integrations to an explicit package version or GitHub
Action ref and review upgrade notes when moving across minor releases.

See [Release policy](docs/release-policy.md).

## Repository Layout

```text
packages/
  adapters/         configured command adapter normalization
  analyzer-js/      JS/TS analyzer and deterministic signals
  agent/            user-owned agent task bundles
  core/             shared types, scoring, report assembly
  config/           .codedecay config loading and normalization
  execution/        safe configured command execution
  git/              git diff and path normalization
  cli/              published @submuxhq/codedecay package
  github-action/    composite GitHub Action
  github-app/       GitHub App server path
  harness/          harness interfaces and evidence schema
  llm/              optional local/BYOK provider abstraction
  mcp/              local MCP server
  memory/           local repo memory
  redteam/          merge-safety report assembly
  report/           JSON, Markdown, SARIF rendering
  skills/           repo-local agent skill loading
  test-audit/       weak-test and missing-test evidence signals
  tool-adapters/    Agent Process, Playwright, coverage, StrykerJS, Semgrep, Schemathesis, Pact adapters
docs/               user docs, RFCs, sample reports
.agents/            contributor agent commands and skills
.codedecay/         local setup scripts and example config
```

## Documentation

The repository includes a static docs viewer built with VitePress. It serves
the same Markdown files for humans and generates agent-friendly outputs at
`/llms.txt`, `/llms-full.txt`, and `/markdown/*.md` when deployed.

- Local docs dev server: `pnpm docs:dev`
- Static docs build: `pnpm docs:build`
- GitHub wiki sync: `pnpm docs:wiki:sync`

The repo also tracks a thin companion wiki index in `.github/wiki/`. GitHub
only provisions the wiki git remote after the first page is created once in the
repository's Wiki tab. After that one-time bootstrap, `pnpm docs:wiki:sync`
keeps the wiki `Home` and sidebar aligned with the docs site.

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Development setup](DEVELOPMENT.md)
- [Editor workflows](docs/editor-workflows.md)
- [Trend snapshots](docs/trend-snapshots.md)
- [Local repo memory](docs/memory.md)
- [Agent skills](docs/skills.md)
- [Test evidence audit](docs/test-audit.md)
- [Tool adapters](docs/tool-adapters.md)
- [Execution probes](docs/execution.md)
- [Differential behavior checks](docs/differential.md)
- [Redteam reports](docs/redteam.md)
- [Agent task bundles](docs/agent.md)
- [LLM providers](docs/llm-providers.md)
- [MCP server](docs/mcp.md)
- [GitHub Action](docs/github-action.md)
- [GitHub App](docs/github-app.md)
- [Sample reports](docs/sample-reports/index.md)
- [Scoring model](docs/scoring.md)
- [Benchmark corpus](docs/benchmark-corpus.md)
- [Deployment surfaces](docs/deployment-surfaces.md)
- [Framework-aware impact map proposal](docs/proposals/framework-aware-impact-map.md)
- [Agent-agnostic redteam harness RFC](docs/rfcs/0001-agent-agnostic-redteam-harness.md)
- [Unified local-first safety harness RFC](docs/rfcs/0002-unified-harness.md)
- [Research basis](docs/research.md)
- [Release policy](docs/release-policy.md)
- [Releasing](docs/releasing.md)

## Contributing

CodeDecay is Apache-2.0 open source. Contributions are welcome through focused
issues and pull requests.

Local setup:

```bash
./.codedecay/setup.local.sh
```

Before opening a PR:

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @submuxhq/codedecay pack --dry-run
```

Read:

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

Apache-2.0. See [LICENSE](LICENSE).
