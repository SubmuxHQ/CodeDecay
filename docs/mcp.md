# MCP Server

CodeDecay can run as a local Model Context Protocol server so agent clients can
ask it for PR risk, impact maps, weak-test audits, and deterministic edge-case
suggestions.

The MCP server calls local CodeDecay analysis only. It does not call an LLM,
does not require API keys, and does not send telemetry.

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

## Safety

MCP clients should treat tool output as analysis, not as permission to execute
commands. The MCP server does not expose arbitrary command execution.

`redteam_report` is report-only. It does not run configured commands, call
Ollama or cloud models, send telemetry, or require CodeDecayCloud.
