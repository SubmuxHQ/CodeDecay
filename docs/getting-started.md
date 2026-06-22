# Getting Started

CodeDecay analyzes pull requests for regression risk and maintainability decay.
It works locally and in CI without cloud services, telemetry, API keys, LLMs, or
model calls.

## Install

```bash
pnpm add -D codedecay
```

## Analyze A PR Diff

```bash
codedecay analyze --base main --head HEAD --format markdown
```

## Analyze Current Working Tree

```bash
codedecay analyze --format markdown
```

## Analyze Another Repository

```bash
codedecay analyze --cwd ../my-repo --format markdown
```

## Write SARIF

```bash
codedecay analyze --format sarif --output codedecay.sarif
```

## Fail CI On High Risk

```bash
codedecay analyze --base main --head HEAD --fail-on high
```

Risk levels:

- `0-39`: low
- `40-69`: medium
- `70-100`: high
