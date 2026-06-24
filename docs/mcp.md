# MCP Server

CodeDecay can run as a local Model Context Protocol server so agent clients can
ask it for PR risk, impact maps, weak-test audits, and deterministic edge-case
suggestions. It can also run explicitly configured local checks when the caller
confirms execution.

The MCP server calls local CodeDecay analysis only. It does not call an LLM,
does not require API keys, and does not send telemetry. Command execution is
opt-in and limited to commands already present in CodeDecay config.

## Run Locally

```bash
npx @submux/codedecay mcp --cwd /path/to/repo
```

## Example MCP Client Config

Exact config shape varies by client. The important part is that the command
runs CodeDecay locally and passes the repository path with `--cwd`.

```json
{
  "mcpServers": {
    "codedecay": {
      "command": "npx",
      "args": ["-y", "@submux/codedecay", "mcp", "--cwd", "/path/to/repo"]
    }
  }
}
```

## Tools

- `analyze_pr`: returns a Markdown or JSON CodeDecay report.
- `impact_map`: returns changed files and impacted areas.
- `audit_tests`: returns weak-test findings and recommended checks.
- `suggest_edge_cases`: returns deterministic edge-case suggestions.
- `redteam_report`: returns a deterministic merge-safety report for your agent,
  including impacted areas, weak-test findings, edge cases, configured checks,
  memory summary, fix tasks, and safety flags.
- `agent_task_bundle`: returns a deterministic task bundle that Codex, Claude
  Code, Cursor, desktop agents, or other MCP-compatible agents can use to fix
  PR risks. It packages a copy-paste prompt, tool evidence, weak-test signals,
  edge cases, suggested checks, skills, and fix tasks. It accepts an optional
  `profile` value: `generic`, `codex`, `claude-code`, `cursor`, or `desktop`.
- `execute_configured_checks`: runs configured CodeDecay commands, probes, and
  enabled tool adapters. It requires `confirmExecution: true` and
  `safety.allowCommands: true`.

Example execution tool input:

```json
{
  "confirmExecution": true,
  "format": "markdown"
}
```

## Safety

MCP clients should treat tool output as analysis, not as permission to execute
commands. The MCP server does not expose arbitrary command execution.

`redteam_report` is report-only. It does not run configured commands, call
Ollama or cloud models, send telemetry, or require CodeDecayCloud. It may include
local skill summaries from `.agents/skills/*/SKILL.md`, but it does not execute
skill content.

`agent_task_bundle` is also report-only. It uses the same deterministic
CodeDecay evidence as `codedecay agent`, and it does not call the MCP client,
Codex, Claude, Cursor, Ollama, cloud models, or CodeDecayCloud. The receiving
agent should treat the bundle as tool evidence plus instructions. The included
prompt is portable across Codex, Claude Code, Cursor, desktop agents, and other
MCP clients. The optional `profile` only changes handoff wording; it does not
call or authenticate with that agent. Any proposed fix still needs verification
with tests or configured checks.

`execute_configured_checks` is the only MCP tool that can execute local commands.
It never accepts command text from MCP input. It can only run commands from
`.codedecay/config.yml`, `codedecay.config.yml`, or enabled configured tool
adapters such as Playwright, StrykerJS, Schemathesis, and Pact.

Execution requires both:

- MCP input contains `confirmExecution: true`
- CodeDecay config contains `safety.allowCommands: true`

If confirmation is missing, CodeDecay returns a non-executing report. If
`safety.allowCommands` is false, configured checks use the existing skip behavior
and do not run.
