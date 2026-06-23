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

- [Next.js risk demo](../examples/nextjs-risk-demo/README.md)
- [Node API risk demo](../examples/node-api-risk-demo/README.md)
