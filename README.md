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
npm install -D @submux/codedecay
```

After a local install, run the CLI with `npx codedecay` or add `codedecay` to
an npm script.

For local development in this repository:

```bash
pnpm install
pnpm build
pnpm test
```

## CLI

```bash
npx codedecay analyze --base main --head HEAD --format markdown
npx codedecay analyze --format json
npx codedecay analyze --format sarif --output codedecay.sarif
npx codedecay analyze --cwd ../my-repo --format markdown
npx codedecay analyze --fail-on high
npx codedecay config --format markdown
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

## Sample Output

For a PR that touches API, auth, database/schema, config, and UI files without
nearby tests, CodeDecay produces a report like this:

```markdown
## CodeDecay Report

**Overall risk:** High

| Score | Value |
| --- | ---: |
| Merge risk | 100/100 |
| Decay risk | 62/100 |

| Findings | Count |
| --- | ---: |
| High | 5 |
| Medium | 4 |
| Low | 0 |

### Likely Impacted Areas

- High **API surface** (api): `src/api/users.ts`
- High **Authentication and authorization** (auth): `src/auth/session.ts`
- High **Database and schema** (database): `prisma/schema.prisma`
- Medium **Build and runtime configuration** (config): `vite.config.ts`

### High Risk Findings

- **Risky source changes without changed tests**
- **Api area changed**
- **Auth area changed**
- **Database area changed**
- **Potential silent failure path**

### Recommended Checks

- `Add or run tests covering src/api/users.ts`
- `Add or run tests covering src/auth/session.ts`
```

Read the report in this order: overall risk, likely impacted areas, high-risk
findings, then recommended checks. Full Markdown, JSON, and SARIF examples are
available in [Sample reports](docs/sample-reports/README.md).

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
- [Configuration](docs/configuration.md)
- [Local repo memory](docs/memory.md)
- [LLM providers](docs/llm-providers.md)
- [MCP server](docs/mcp.md)
- [GitHub Action](docs/github-action.md)
- [Sample reports](docs/sample-reports/README.md)
- [Scoring model](docs/scoring.md)
- [Framework-aware impact map proposal](docs/proposals/framework-aware-impact-map.md)
- [Research basis](docs/research.md)
- [Releasing](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)
