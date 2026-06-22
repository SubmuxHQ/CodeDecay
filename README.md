# CodeDecay

CodeDecay is an open-source CLI and GitHub Action for pull request
regression-risk analysis, code-decay detection, and change-impact analysis.

It helps teams using AI coding agents and AI-assisted development detect what a
PR might break before merge: impacted files, routes, modules, missing tests,
duplicated logic, complexity growth, fragile abstractions, and maintainability
decay.

It is not a generic AI code reviewer. CodeDecay analyzes any pull request, with
special focus on risks common in AI-generated or AI-assisted code:

- What could this PR break?
- Which files, routes, and modules are impacted?
- What tests may be missing?
- Did this PR increase maintainability decay?
- Should this PR be merged, reviewed carefully, or blocked?

CodeDecay is deterministic, local-first, and useful without cloud services. It
does not require telemetry, API keys, LLMs, or model calls.

## Install

```bash
pnpm add -D @submux/codedecay
```

For local development in this repository:

```bash
pnpm install
pnpm build
pnpm test
```

## CLI

```bash
codedecay analyze --base main --head HEAD --format markdown
codedecay analyze --format json
codedecay analyze --format sarif --output codedecay.sarif
codedecay analyze --cwd ../my-repo --format markdown
codedecay analyze --fail-on high
```

Options:

- `--base <ref>`: base git ref to compare from.
- `--head <ref>`: head git ref to compare to.
- `--cwd <path>`: repository working directory to analyze.
- `--format json|markdown|sarif`: report format.
- `--output <path>`: write report to a file instead of stdout.
- `--fail-on low|medium|high`: exit non-zero when the PR reaches this risk
  level or higher.

If `--base` is omitted, CodeDecay analyzes the current working tree diff.

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
          base: ${{ github.event.pull_request.base.sha }}
          head: ${{ github.event.pull_request.head.sha }}
          format: markdown
          fail-on: high
```

## Risk Levels

- `0-39`: low
- `40-69`: medium
- `70-100`: high

## Repository

Public repository:

```text
git@github.com:SubmuxHQ/codedecay.git
```

## Documentation

- [Getting started](docs/getting-started.md)
- [GitHub Action](docs/github-action.md)
- [Scoring model](docs/scoring.md)
- [Research basis](docs/research.md)
- [Contributing](CONTRIBUTING.md)
