# Getting Started

CodeDecay analyzes pull requests for regression risk and maintainability decay.
It works locally and in CI without cloud services, telemetry, API keys, LLMs,
or model calls.

## Deterministic Default

Use the deterministic workflow first. Optional assisted workflows are separate
and never implicit.

| Workflow | Default | What it does |
| --- | --- | --- |
| `analyze`, `redteam`, `agent`, `snapshot` | Yes | Local deterministic analysis and reporting. |
| `execute`, `differential` | No | Runs only repo-allowlisted local commands after explicit opt-in. |
| `llm-review` | No | Calls a user-owned provider only when invoked directly. |
| Optional LLM providers | No | Disabled by default and only called by commands that explicitly opt in. |

## Install

Use the package manager your repository already uses:

```bash
npm install -D @submuxhq/codedecay
pnpm add -D @submuxhq/codedecay
bun add -d @submuxhq/codedecay
yarn add -D @submuxhq/codedecay
```

For a no-install smoke test:

```bash
npx -y @submuxhq/codedecay --help
```

After a local install, run CodeDecay with `npx codedecay`, `pnpm codedecay`,
`bunx codedecay`, or add `codedecay` to a package script.

Do not run `npm install` inside a Bun, pnpm, or Yarn workspace that uses
`workspace:*` dependencies. npm may fail before CodeDecay is installed. In Bun
repos with `minimumReleaseAge`, a fresh CodeDecay release may also be blocked by
repo policy; for local evaluation you can override it explicitly:

```bash
bun add -d @submuxhq/codedecay --minimum-release-age 0
```

## Analyze A PR Diff

```bash
npx codedecay analyze --base main --head HEAD --format markdown
```

## Analyze Current Working Tree

```bash
npx codedecay analyze --format markdown
```

## Analyze Another Repository

```bash
npx codedecay analyze --cwd ../my-repo --format markdown
```

## Generate A Redteam Report

Use `redteam` when you want one report for yourself or your coding agent that
summarizes what the PR could break, weak-test evidence, missing edge cases,
and fix tasks.

```bash
npx codedecay redteam --base main --head HEAD --format markdown
```

The current redteam MVP is report-only. It does not run commands or call an
LLM.

## Discover OSS Tools To Reuse

Use `doctor` when you want CodeDecay to recommend existing open-source tools
for the repository shape instead of building custom checks from scratch.

```bash
npx codedecay doctor --format markdown
npx codedecay doctor --write-config-preview
```

`doctor` only reads local files. It does not install tools, execute commands,
call models, use network access, or edit `.codedecay/config.yml`. The config
preview is written to `.codedecay/local/config-preview.yml` so you can review it
first.

## Hand Evidence To Your Agent

Use `agent` when you want Codex, Claude Code, Cursor, a desktop agent, or
another user-owned agent to act on CodeDecay's findings.

```bash
npx codedecay agent --base main --head HEAD --format markdown --output codedecay-agent.md
```

Then give `codedecay-agent.md` to your agent and ask it to:

- fix high-risk findings first,
- add tests that exercise real API, UI, database, or downstream behavior,
- cover the missing edge cases listed by CodeDecay,
- run the relevant project checks,
- rerun CodeDecay after changes.

The agent bundle is local evidence plus instructions. CodeDecay does not call
Codex, Claude, Cursor, Ollama, cloud models, or CodeDecayCloud while creating
it.

## Recommended Local Loop

```bash
npx codedecay analyze --base main --head HEAD --format markdown
npx codedecay redteam --base main --head HEAD --format markdown --output codedecay-redteam.md
npx codedecay agent --base main --head HEAD --format markdown --output codedecay-agent.md
```

Use the redteam report to understand the PR risk. Use the agent bundle to give
your own coding agent the evidence, missing checks, and fix tasks it should
work through. After the agent changes code, run your project checks and run
CodeDecay again.

## Persist A Trend Snapshot

Use `snapshot` when you want a stable artifact you can keep in CI, compare with
an earlier run, or review over time.

```bash
npx codedecay snapshot --format json --output .codedecay/snapshot.json
npx codedecay snapshot --compare .codedecay/previous-snapshot.json --format markdown
```

See [Trend snapshots](trend-snapshots.md) for a GitHub-native artifact workflow.

## Import Repo Memory From Incidents Or CI

Use `memory-import` to turn structured learnings into repo-local memory that
future analyses can reuse deterministically.

```bash
npx codedecay memory-import --input incidents.json
npx codedecay memory-import --input incidents.json --apply --format json
```

See [Local repo memory](memory.md) for supported import shapes and dedupe
behavior.

## Write SARIF

```bash
npx codedecay analyze --format sarif --output codedecay.sarif
```

SARIF is the fastest local-first path for in-editor feedback because editors can
show inline diagnostics without parsing Markdown.

See [Editor workflows](editor-workflows.md).

## Inspect CodeDecay Config

Configuration is optional. Missing config uses safe defaults.

```bash
npx codedecay config --format markdown
```

## Fail CI On High Risk

```bash
npx codedecay analyze --base main --head HEAD --fail-on high
```

Risk levels:

- `0-39`: low
- `40-69`: medium
- `70-100`: high

## Try An Example

Use the example projects to see a realistic high-risk report before wiring
CodeDecay into your own repository:

- [Next.js risk demo](https://github.com/SubmuxHQ/CodeDecay/blob/main/examples/nextjs-risk-demo/README.md)
- [Node API risk demo](https://github.com/SubmuxHQ/CodeDecay/blob/main/examples/node-api-risk-demo/README.md)

## Optional Assisted Workflows

If you want optional provider-backed suggestions without changing the default
workflow:

1. Configure one user-owned provider in `.codedecay/config.yml`.
2. Run `npx codedecay llm-review --ping` to validate the provider config.
3. Run `npx codedecay llm-review --base main --head HEAD --format markdown`.

See [LLM providers](llm-providers.md) for the recommended config path.
