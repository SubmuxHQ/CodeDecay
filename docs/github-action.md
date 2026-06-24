# GitHub Action

CodeDecay ships a composite GitHub Action wrapper around the bundled CLI.

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
          mode: analyze
          base: ${{ github.event.pull_request.base.sha }}
          head: ${{ github.event.pull_request.head.sha }}
          cwd: .
          format: markdown
          fail-on: high
```

## SARIF Output

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: analyze
    base: ${{ github.event.pull_request.base.sha }}
    head: ${{ github.event.pull_request.head.sha }}
    cwd: .
    format: sarif
    output: codedecay.sarif
    fail-on: high
```

Relative `output` paths resolve from `cwd`. For example, with `cwd:
packages/web` and `output: codedecay.sarif`, the SARIF file is written to
`packages/web/codedecay.sarif`. Absolute `output` paths are honored exactly.

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: analyze
    cwd: packages/web
    format: sarif
    output: codedecay.sarif
```

The MVP action writes a markdown summary to `$GITHUB_STEP_SUMMARY`. SARIF upload
can be added by the workflow using GitHub's code scanning upload action.

## Redteam And Agent Modes

The action can also run report-only redteam and agent bundle modes:

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: redteam
    base: ${{ github.event.pull_request.base.sha }}
    head: ${{ github.event.pull_request.head.sha }}
    cwd: .
    format: markdown
    fail-on: high
```

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: agent
    base: ${{ github.event.pull_request.base.sha }}
    head: ${{ github.event.pull_request.head.sha }}
    cwd: .
    format: markdown
    output: codedecay-agent.md
```

Supported modes are `analyze`, `redteam`, and `agent`. The action does not
expose command-executing modes. `format: sarif` is supported only with
`mode: analyze`. `fail-on` is forwarded for `analyze` and `redteam`; `agent`
mode produces a task bundle for a user-owned coding agent and does not gate the
workflow by risk level.

The CodeDecay repository dogfoods this local action before release to verify the
same workflow users run in pull requests.
