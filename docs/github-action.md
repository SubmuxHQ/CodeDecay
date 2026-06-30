# GitHub Action

CodeDecay ships a composite GitHub Action wrapper around the bundled CLI.

```yaml
name: CodeDecay

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

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
          github-token: ${{ github.token }}
```

On pull request events, the action also posts or updates one sticky PR comment
with the highest-signal CodeDecay catch and a collapsed full report. The comment
uses the workflow `github-token` input, defaults to the GitHub Actions workflow
token, and is skipped without failing the workflow when the token or PR context
is unavailable. The Step Summary is still written on every run.

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

## Product Preview Verification

`mode: product` runs the explicit `codedecay product` workflow. It does not
accept arbitrary shell commands; startup, auth setup, generated tests, and
browser automation still follow repo-local CodeDecay config and
`safety.allowCommands`.

Configure product targets to read the preview URL from the action:

```yaml
version: 1
productTesting:
  targets:
    web:
      previewUrlEnv: CODEDECAY_PRODUCT_PREVIEW_URL
      timeoutMs: 30000
    api:
      previewUrlEnv: CODEDECAY_PRODUCT_PREVIEW_URL
      timeoutMs: 30000
toolAdapters:
  schemathesis:
    schema: docs/openapi.yaml
safety:
  allowCommands: true
```

Example PR workflow for Vercel, Netlify, or any static preview URL provider:

```yaml
name: CodeDecay Product Preview

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  product-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run product verification
        uses: SubmuxHQ/CodeDecay/packages/github-action@v0
        with:
          mode: product
          cwd: .
          target: web
          preview-url: ${{ vars.PREVIEW_URL }}
          product-explore: true
          product-generate-tests: true
          product-run-generated-tests: true
          product-fail-on-classification: confirmed-regression
          format: markdown
          output: codedecay-product.md
```

Use the preview URL expression from your platform. Common choices are a Vercel
deployment URL step output, a Netlify deploy preview URL, or a static preview URL
written by an earlier workflow step. Keep tokens, cookies, and provider secrets
in environment variables or GitHub secrets; CodeDecay does not print headers,
request bodies, screenshots, traces, or query strings by default.

For API previews:

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: product
    target: api
    preview-url: ${{ steps.preview.outputs.url }}
    product-generate-api-tests: true
    product-run-generated-api-tests: true
    product-fail-on-classification: confirmed-regression,auth-or-test-data-failure
    format: markdown
    output: codedecay-api-product.md
```

### Product PR Comment

For `mode: product`, you may still want a product-specific comment with failed
checks and rerun instructions. Write an output file and comment it after the
action:

```yaml
- name: Run product verification
  uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: product
    target: web
    preview-url: ${{ steps.preview.outputs.url }}
    product-explore: true
    product-generate-tests: true
    product-run-generated-tests: true
    product-fail-on-classification: confirmed-regression
    format: markdown
    output: codedecay-product.md

- name: Comment product verification
  if: always() && github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('node:fs');
      const body = fs.existsSync('codedecay-product.md')
        ? fs.readFileSync('codedecay-product.md', 'utf8').slice(0, 60000)
        : 'CodeDecay product verification did not produce an output file.';
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body
      });
```

## Scheduled Product Monitoring

Scheduled runs can verify staging or production without a hosted CodeDecay
service. Save JSON product trend snapshots as artifacts for history:

```yaml
name: CodeDecay Product Monitor

on:
  schedule:
    - cron: "17 */6 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: SubmuxHQ/CodeDecay/packages/github-action@v0
        with:
          mode: product
          target: api
          preview-url: ${{ vars.STAGING_URL }}
          product-generate-api-tests: true
          product-run-generated-api-tests: true
          product-fail-on-classification: confirmed-regression
          format: json
          output: .codedecay/local/product-trends/staging-${{ github.run_id }}.json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: codedecay-product-trend-${{ github.run_id }}
          path: .codedecay/local/product-trends/*.json
```

## Trend Snapshot Artifacts

The composite action supports `analyze`, `redteam`, `agent`, and `product`.
For code-risk trend snapshots, call the CLI directly in the workflow and upload
the artifact:

```yaml
- run: pnpm exec codedecay snapshot --base "${{ github.event.pull_request.base.sha }}" --head "${{ github.event.pull_request.head.sha }}" --format json --output codedecay-snapshot.json
- uses: actions/upload-artifact@v4
  with:
    name: codedecay-snapshot
    path: codedecay-snapshot.json
```

To compare against a saved snapshot:

```yaml
- run: pnpm exec codedecay snapshot --base "${{ github.event.pull_request.base.sha }}" --head "${{ github.event.pull_request.head.sha }}" --compare .codedecay/previous-snapshot.json --format markdown
```

See [Trend snapshots](trend-snapshots.md) for a fuller artifact and history
workflow.

## Redteam And Agent Modes

The action can also run report-only redteam and agent bundle modes. Redteam
mode is useful as a Step Summary because it includes impact, memory, edge cases,
and fix tasks for a user-owned agent:

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: redteam
    base: ${{ github.event.pull_request.base.sha }}
    head: ${{ github.event.pull_request.head.sha }}
    cwd: .
    format: markdown
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

Supported modes are `analyze`, `redteam`, `agent`, and `product`. The action
does not expose arbitrary command passthrough. Product mode only forwards the
explicit product verification inputs documented above and still relies on
repo-local CodeDecay config for command safety. `format: sarif` is supported
only with `mode: analyze`. `fail-on` is forwarded for `analyze` and `redteam`;
`product-fail-on-classification` gates product mode; `agent` mode produces a
task bundle for a user-owned coding agent and does not gate the workflow by risk
level.

Use `fail-on` with `analyze` when you want a deterministic CI gate. You can also
add `fail-on` to `redteam` if your repository wants strict risk-score gating.
The CodeDecay repository dogfoods `redteam` report-only so the Step Summary is
always available while lint, typecheck, tests, build, package dry-run, and the
PR safety efficacy eval remain the hard validation gates.
