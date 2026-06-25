# Developing CodeDecay

This guide is for contributors building CodeDecay from source.

CodeDecay is a TypeScript/pnpm monorepo. It does not require a local database,
seed data, Docker stack, cloud account, API key, LLM key, or model call to run
the current OSS toolchain.

## Prerequisites

| Tool | Purpose |
|:-----|:--------|
| Node.js 20+ | Runtime and build tooling |
| pnpm 11.8.0 | Package manager |
| Git | Diff and fixture integration tests |
| gh | Recommended for issue and PR workflow |

## One-command setup

```bash
./.codedecay/setup.local.sh
```

The setup script:

1. checks prerequisites,
2. runs `pnpm install`,
3. runs lint, typecheck, tests, and build,
4. writes `.codedecay/local/state.json`.

Re-run it after pulling large dependency or package changes.

## Local status and teardown

```bash
./.codedecay/status.local.sh
./.codedecay/teardown.local.sh
```

`teardown.local.sh` only removes generated CodeDecay local state. There are no
containers, database volumes, or seed services to remove.

## Common commands

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @submuxhq/codedecay pack --dry-run
```

Run the built CLI:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js analyze --format markdown
node packages/cli/dist/index.js config --format markdown
```

## End-user dogfood demo

Run the local end-user demo harness before changing broad CLI behavior:

```bash
pnpm demo:end-user
```

The harness builds the local CLI, creates isolated demo git repositories, runs
the user-facing commands, starts a real MCP client smoke, simulates the GitHub
Action runtime, and writes command logs to:

```text
.codedecay/local/end-user-demo/<run-id>/run.json
.codedecay/local/end-user-demo/<run-id>/summary.md
```

`run.json` includes commands, cwd, exit code, duration, stdout, stderr, parsed
JSON when available, and output file metadata. Use it as the first reproduction
artifact when filing follow-up bugs from dogfood runs.

## Optional CodeDecay config and memory

Examples live in:

- `.codedecay/config.example.yml`
- `.codedecay/memory.example.json`

Copy them only when you intentionally want repo-local config or memory:

```bash
cp .codedecay/config.example.yml .codedecay/config.yml
cp .codedecay/memory.example.json .codedecay/memory.json
```

Keep `safety.allowCommands: false` unless you are explicitly testing
`codedecay execute` or `codedecay differential`.

## Agentic development setup

Shared agent resources live in `.agents/`.

- Commands: `.agents/commands/`
- Skills: `.agents/skills/`
- Codex MCP config: `.codex/config.toml`
- Cursor rules: `.cursor/rules/codedecay.mdc`
- Cursor MCP config: `.cursor/mcp.json`
- Claude pointer: `CLAUDE.md`
- Claude command/skill links: `.claude/commands`, `.claude/skills`
- OpenCode config: `opencode.json`
- Shared MCP config: `.mcp.json`

Build before using the local MCP server:

```bash
pnpm build
node packages/cli/dist/index.js mcp
```

The agent-agnostic redteam harness roadmap is documented in
[RFC 0001](docs/rfcs/0001-agent-agnostic-redteam-harness.md).

## PR workflow

1. Create or use a GitHub issue.
2. Branch from latest `main`.
3. Keep the PR focused.
4. Run `.agents/commands/ci-check.md`.
5. Include `Closes #<issue-number>` in the PR body.

Do not push directly to `main`.
