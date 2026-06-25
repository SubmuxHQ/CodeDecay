# Getting Started

CodeDecay analyzes pull requests for regression risk and maintainability decay.
It works locally and in CI without cloud services, telemetry, API keys, LLMs, or
model calls.

## Install

```bash
npm install -D @submux/codedecay
```

Using pnpm:

```bash
pnpm add -D @submux/codedecay
```

After a local install, run CodeDecay with `npx codedecay` or add `codedecay` to
an npm script.

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
summarizes what the PR could break, weak-test evidence, missing edge cases, and
fix tasks.

```bash
npx codedecay redteam --base main --head HEAD --format markdown
```

The current redteam MVP is report-only. It does not run commands or call an LLM.

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

## Write SARIF

```bash
npx codedecay analyze --format sarif --output codedecay.sarif
```

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
