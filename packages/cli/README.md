# CodeDecay CLI

Find what your coding agent missed before merge.

CodeDecay is an open-source, local-first CLI and GitHub Action for PR
regression-risk analysis, maintainability decay detection, weak-test auditing,
and agent handoff workflows.

It does not require telemetry, cloud services, API keys, LLMs, or model calls.
Optional LLM, agent, memory, and tool integrations are user-owned and explicit.

## Install

```bash
npm install -D @submux/codedecay
```

Run with:

```bash
npx codedecay --help
```

## Quickstart

```bash
npx codedecay analyze --format markdown
npx codedecay analyze --base main --head HEAD --format json
npx codedecay analyze --format sarif --output codedecay.sarif
npx codedecay redteam --base main --head HEAD --format markdown
npx codedecay agent --profile codex --base main --head HEAD --format markdown
```

## Commands

| Command | Purpose |
| --- | --- |
| `codedecay analyze` | Deterministic PR risk, impact, and decay report. |
| `codedecay redteam` | Merge-safety report with impact, weak-test proof, edge cases, skills, memory, and fix tasks. |
| `codedecay agent` | Task bundle for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients. |
| `codedecay config` | Show normalized config. |
| `codedecay memory` | Show local repo memory. |
| `codedecay execute` | Run explicitly configured local checks and tool adapters. |
| `codedecay differential` | Compare configured base/head behavior probes. |
| `codedecay mcp` | Start the local MCP server. |

Common flags:

```bash
--base <ref>
--head <ref>
--cwd <path>
--format json|markdown|sarif
--output <path>
--fail-on low|medium|high
--profile generic|codex|claude-code|cursor|pi|opencode|desktop
```

Reports are written to stdout by default. Relative `--output` paths resolve from
the analysis working directory.

## GitHub Action

```yaml
- uses: SubmuxHQ/CodeDecay/packages/github-action@v0
  with:
    mode: redteam
    base: ${{ github.event.pull_request.base.sha }}
    head: ${{ github.event.pull_request.head.sha }}
    format: markdown
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
