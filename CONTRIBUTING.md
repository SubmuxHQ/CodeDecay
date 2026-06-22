# Contributing to CodeDecay

CodeDecay is built as a deterministic, local-first tool. Contributions should
preserve these project constraints:

- no telemetry
- no cloud-only dependency
- no required API keys
- no required LLM or model calls
- deterministic scoring for the same git diff

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## Project Layout

- `packages/core`: shared types, scores, and rule runner.
- `packages/git`: git diff collection and changed-file normalization.
- `packages/analyzer-js`: JavaScript and TypeScript analyzer.
- `packages/report`: JSON, Markdown, and SARIF report rendering.
- `packages/cli`: bundled `codedecay` CLI.
- `packages/github-action`: composite GitHub Action wrapper.
- `docs`: public documentation.

## Good First Contributions

- Add JS/TS fixture repos for common regression scenarios.
- Improve risky path detection for popular frameworks.
- Add decay rules with deterministic evidence.
- Improve markdown report clarity.
- Add SARIF locations where a rule can identify a useful line number.

## Rule Guidelines

Rules should produce findings that explain:

- what changed
- why it matters for regression or decay risk
- where the reviewer should look
- which tests or checks may reduce risk

Avoid vague review comments. CodeDecay should help reviewers decide what to test
or inspect before merge.
