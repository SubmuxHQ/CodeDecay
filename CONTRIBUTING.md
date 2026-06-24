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
./.codedecay/setup.local.sh
```

CodeDecay does not require a local database, seed data, cloud account, API key,
LLM key, or model call for normal OSS development.

For manual validation:

```bash
pnpm install
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
```

See [Developing CodeDecay](DEVELOPMENT.md) for local setup, agent resources,
and optional CodeDecay config/memory examples.

## Project Layout

- `packages/adapters`: configured command adapter orchestration.
- `packages/agent`: deterministic task bundles for user-owned agents.
- `packages/analyzer-js`: JavaScript and TypeScript analyzer.
- `packages/cli`: bundled `codedecay` CLI.
- `packages/config`: repo-local CodeDecay config loading and validation.
- `packages/core`: shared types, scores, and rule runner.
- `packages/execution`: safe command execution primitives.
- `packages/git`: git diff collection and changed-file normalization.
- `packages/github-app`: optional hosted GitHub App service.
- `packages/github-action`: composite GitHub Action wrapper.
- `packages/harness`: harness interfaces, evidence schema, and registry.
- `packages/llm`: optional local/BYOK LLM provider boundaries.
- `packages/mcp`: local MCP server and MCP tool wrappers.
- `packages/memory`: local repo memory loading and memory provider boundaries.
- `packages/redteam`: deterministic redteam report assembly.
- `packages/report`: JSON, Markdown, and SARIF report rendering.
- `packages/skills`: repo-local agent skill discovery.
- `packages/test-audit`: missing-test and weak-test proof audit.
- `packages/tool-adapters`: Playwright, StrykerJS, Schemathesis, and Pact adapter wrappers.
- `examples`: runnable adoption examples and risk demos.
- `docs`: public documentation.

## Good First Contributions

- Add JS/TS fixture repos for common regression scenarios.
- Improve risky path detection for popular frameworks.
- Add decay rules with deterministic evidence.
- Improve markdown report clarity.
- Add SARIF locations where a rule can identify a useful line number.

## Issue And PR Labels

CodeDecay keeps labels compact and functional:

- `bug`, `enhancement`, `documentation`, and `question` describe the request type.
- `type:*` labels cover maintenance work such as `type: chore`, `type: ci`, `type: refactor`, `type: test`, `type: security`, and `type: release`.
- `status:*` labels show what is blocking progress, such as `status: needs-triage`, `status: needs-repro`, `status: needs-tests`, `status: blocked`, or `status: release-blocker`.
- `area:*` labels map work to packages and docs, such as `area: cli`, `area: core`, `area: analyzer-js`, `area: git`, `area: report`, `area: config`, `area: adapters`, `area: execution`, `area: test-audit`, `area: redteam`, `area: agent`, `area: mcp`, `area: memory`, `area: llm`, `area: github-action`, `area: github-app`, `area: harness`, `area: packaging`, `area: docs`, and `area: dev-experience`.
- `good first issue` and `help wanted` identify issues that are suitable for external contributors.

## Pull Request Expectations

- Keep PRs focused on one change or one clear follow-up sequence.
- Include tests when behavior changes.
- Update docs when CLI flags, report output, or action behavior changes.
- Call out risk areas and missing follow-up work explicitly in the PR description.

## Rule Guidelines

Rules should produce findings that explain:

- what changed
- why it matters for regression or decay risk
- where the reviewer should look
- which tests or checks may reduce risk

Avoid vague review comments. CodeDecay should help reviewers decide what to test
or inspect before merge.
