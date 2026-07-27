# CodeDecay CLI

Find what your coding agent missed before merge.

CodeDecay is an open-source AI orchestration layer that red-teams PRs before
merge. It uses your own coding agents and open-source tools to find missed
bugs, weak tests, edge cases, and user-facing regressions.

It does not require telemetry, cloud services, API keys, LLMs, or model calls.
Optional LLM, agent, memory, and tool integrations are user-owned and explicit.

## Install

```bash
npm install -D @submuxhq/codedecay
```

Run with:

```bash
npx codedecay --help
npx codedecay man analyze
```

## Quickstart

```bash
npx codedecay ai --format markdown
npx codedecay ai --profile claude-code --base main --head HEAD --format markdown
npx codedecay ai --with-checks --base main --head HEAD --format markdown
npx codedecay analyze --format markdown
npx codedecay analyze --base main --head HEAD --format json
npx codedecay analyze --format sarif --output codedecay.sarif
npx codedecay snapshot --format json --output .codedecay/snapshot.json
npx codedecay llm-review --ping
npx codedecay redteam --base main --head HEAD --format markdown
npx codedecay memory-import --input incidents.json
npx codedecay memory-learn --input ci-failure.json
```

## Commands

| Command | Purpose |
| --- | --- |
| `codedecay ai` | Recommended AI-first PR safety workflow for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients. |
| `codedecay analyze` | Deterministic PR risk, impact, and decay report. |
| `codedecay snapshot` | Stable repository health snapshot and comparison artifact. |
| `codedecay redteam` | Merge-safety report with impact, weak-test evidence, edge cases, skills, memory, and fix tasks. |
| `codedecay llm-review` | Explicit opt-in LLM-assisted suggestions grounded in deterministic CodeDecay analysis. |
| `codedecay agent` | Task bundle for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients. |
| `codedecay config` | Show normalized config. |
| `codedecay memory` | Show local repo memory. |
| `codedecay memory-import` | Preview or apply structured learnings into repo-local memory. |
| `codedecay memory-learn` | Learn local memory from CI, PR, and CodeDecay report signals. |
| `codedecay execute` | Run explicitly configured local checks and tool adapters. |
| `codedecay differential` | Compare configured base/head behavior probes. |
| `codedecay mcp` | Start the local MCP server. |
| `codedecay help` | Show root or per-command help. |
| `codedecay man` | Show a longer manual page for a command. |
| `codedecay update` | Print or apply the recommended upgrade command. |
| `codedecay uninstall` | Print or apply the recommended uninstall and cleanup plan. |
| `codedecay version` | Print the installed CLI version. |

Common flags:

```bash
--base <ref>
--head <ref>
--cwd <path>
--format json|markdown|sarif
--output <path>
--fail-on low|medium|high
--with-checks
--profile generic|codex|claude-code|cursor|pi|opencode|desktop
```

Utility examples:

```bash
codedecay help analyze
codedecay llm-review --ping
codedecay man update
codedecay version
codedecay update
codedecay update --apply
codedecay uninstall --purge-local
codedecay uninstall --purge-local --apply
```

Reports are written to stdout by default. Relative `--output` paths resolve from
the analysis working directory.

## Deterministic Default

| Workflow | Default | Behavior |
| --- | --- | --- |
| `ai`, `analyze`, `redteam`, `agent`, `snapshot` | Yes | Deterministic local analysis with no model calls. |
| `execute`, `differential` | No | Runs only repo-allowlisted local commands after explicit opt-in. |
| `llm-review` | No | Calls a user-owned provider only when invoked directly. |
| Optional LLM providers | No | Disabled by default and only used by commands that explicitly opt in. |

## GitHub Action

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: ai
    base: ${{ github.event.pull_request.base.sha }}
    head: ${{ github.event.pull_request.head.sha }}
    format: markdown
    profile: codex
    fail-on: high
```

## Safety

By default CodeDecay:

- does not send telemetry
- does not call hosted services
- does not require API keys
- does not call LLMs or models
- does not execute commands hidden from the user

Configured command execution requires explicit config and safety gates.

## Links

- Repository: https://github.com/SubmuxHQ/CodeDecay
- Documentation: https://github.com/SubmuxHQ/CodeDecay#readme
- Issues: https://github.com/SubmuxHQ/CodeDecay/issues
- License: Apache-2.0
