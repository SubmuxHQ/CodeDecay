# CodeDecay

[![CI](https://github.com/SubmuxHQ/CodeDecay/actions/workflows/ci.yml/badge.svg)](https://github.com/SubmuxHQ/CodeDecay/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@submuxhq/codedecay?label=npm)](https://www.npmjs.com/package/@submuxhq/codedecay)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Find what your coding agent missed before merge.

CodeDecay is an open-source, local-first PR safety harness for AI-assisted
development. It analyzes pull requests for regression risk, maintainability
decay, weak tests, missing edge cases, and user-facing blast radius before code
is merged.

It is not a generic AI code reviewer and it is not an AI-authorship detector.
CodeDecay asks a narrower, more useful question:

```text
What could this PR break, and are the tests actually proving it will not?
```

## Why CodeDecay

AI coding agents can produce code that compiles, passes local happy-path tests,
and still breaks another product flow. CodeDecay gives developers and their
agents a structured merge-safety pass:

- map changed files to likely impacted APIs, routes, modules, config, auth, and
  data/schema areas
- score merge risk and maintainability decay
- flag missing tests and weak or fake-looking test proof
- suggest edge cases and stronger checks
- package evidence for Codex, Claude Code, Cursor, Pi, OpenCode, desktop
  agents, or MCP-compatible workflows
- run explicitly configured local checks when the user allows execution
- compare base/head behavior through configured probes

CodeDecay is useful by itself in deterministic mode. Optional agent, LLM, memory,
and tool integrations must be user-owned and explicit.

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
is treated as suggestions, not trusted proof.

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

## Commands

| Command | Purpose |
| --- | --- |
| `codedecay analyze` | Deterministic PR risk, impact, and decay analysis. |
| `codedecay redteam` | Merge-safety report with impact, weak-test proof, edge cases, memory, skills, and fix tasks. |
| `codedecay agent` | Portable task bundle for user-owned agents such as Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients. |
| `codedecay config` | Inspect normalized CodeDecay config. |
| `codedecay memory` | Inspect local repo memory from `.codedecay/memory.json`. |
| `codedecay execute` | Run explicitly configured local commands and OSS tool adapters. |
| `codedecay differential` | Run configured probes on base and head and compare behavior. |
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
codedecay man redteam
codedecay version
codedecay update
codedecay uninstall --purge-local
```

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
          fail-on: high
```

The action writes a GitHub Step Summary and preserves CLI exit codes.

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
- auth, session, and security-sensitive files
- database/schema files such as `prisma/schema.prisma`
- config, build, deployment, and runtime files
- broad unrelated PR scope
- large functions and complexity growth
- duplicated logic
- test bloat
- fragile abstractions
- weak tests, missing nearby tests, and low-confidence test proof

The analyzer is intentionally conservative. Findings are review signals, not
proof that a bug exists.

## Red-Team Workflow

Use the red-team workflow when reviewing AI-assisted PRs:

```bash
npx codedecay redteam --base main --head HEAD --format markdown --output codedecay-redteam.md
npx codedecay agent --profile codex --base main --head HEAD --format markdown --output codedecay-agent.md
```

Then give `codedecay-agent.md` to your preferred agent and ask it to:

1. inspect the changed files and impacted routes/APIs
2. explain what real user/API/database path could break
3. add tests that prove the real path, not only mocked helper behavior
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
edge-case suggestions, red-team reports, agent task bundles, and confirmed
configured checks.

See [MCP docs](docs/mcp.md).

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
  playwright:
    enabled: true
    command: pnpm exec playwright test
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
- grouped low/medium/high findings
- impacted areas and routes/APIs
- recommended tests and checks

See [Scoring model](docs/scoring.md).

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
  test-audit/       weak-test and missing-test proof signals
  tool-adapters/    Playwright, StrykerJS, Schemathesis, Pact adapters
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
- [Local repo memory](docs/memory.md)
- [Agent skills](docs/skills.md)
- [Test proof audit](docs/test-audit.md)
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
- [Framework-aware impact map proposal](docs/proposals/framework-aware-impact-map.md)
- [Agent-agnostic redteam harness RFC](docs/rfcs/0001-agent-agnostic-redteam-harness.md)
- [Research basis](docs/research.md)
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
