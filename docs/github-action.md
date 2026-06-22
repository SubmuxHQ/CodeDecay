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
    cwd: packages/web
    format: sarif
    output: codedecay.sarif
```

The MVP action writes a markdown summary to `$GITHUB_STEP_SUMMARY`. SARIF upload
can be added by the workflow using GitHub's code scanning upload action.

The CodeDecay repository dogfoods this local action before release to verify the
same workflow users run in pull requests.
