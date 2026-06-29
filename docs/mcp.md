# MCP Server

CodeDecay can run as a local Model Context Protocol server so agent clients can
ask it for PR risk, impact maps, weak-test audits, score breakdowns, runtime
test evidence, deterministic edge-case suggestions, local pattern-pack matches,
and OSS tool recommendations. It can also run
explicitly configured local checks and product verification when the caller
confirms execution.

The MCP server calls local CodeDecay analysis only. It does not call an LLM,
does not require API keys, and does not send telemetry. Command execution is
opt-in and limited to commands already present in CodeDecay config.

## Run Locally

```bash
npx @submuxhq/codedecay mcp --cwd /path/to/repo
```

For agent users who only need a local server, that is the one-command setup:
start the command above from the repo, then point Codex, Claude Code, Cursor, or
another MCP client at it.

## Example MCP Client Config

Exact config shape varies by client. The important part is that the command
runs CodeDecay locally and passes the repository path with `--cwd`.

```json
{
  "mcpServers": {
    "codedecay": {
      "command": "npx",
      "args": ["-y", "@submuxhq/codedecay", "mcp", "--cwd", "/path/to/repo"]
    }
  }
}
```

## Tools

- `analyze_pr`: returns a Markdown or JSON CodeDecay report.
- `impact_map`: returns changed files, impacted areas, and concrete route/API
  impacts when CodeDecay can detect them.
- `audit_tests`: returns missing-test and weak-test evidence findings plus
  recommended checks.
- `suggest_edge_cases`: returns deterministic edge-case suggestions.
- `tool_recommendations`: returns local OSS tool recommendations for the repo
  shape. It does not install tools, execute commands, call models, or use
  network access.
- `pattern_search`: returns local pattern-pack matches for changed areas so
  user-owned agents can consider known edge cases and weak-test traps.
- `redteam_report`: returns a deterministic merge-safety report for your agent,
  including impacted areas, weak-test findings, edge cases, configured checks,
  memory summary, fix tasks, and safety flags.
- `agent_task_bundle`: returns a deterministic task bundle that Codex, Claude
  Code, Cursor, Pi, OpenCode, desktop agents, or other MCP-compatible agents can
  use to fix PR risks. It packages a copy-paste prompt, tool evidence, weak-test
  signals, edge cases, suggested checks, skills, and fix tasks. It accepts an
  optional `profile` value: `generic`, `codex`, `claude-code`, `cursor`, `pi`,
  `opencode`, or `desktop`.
- `execute_configured_checks`: runs configured CodeDecay commands, probes, and
  enabled tool adapters. It requires `confirmExecution: true` and
  `safety.allowCommands: true`.
- `codedecay_product_plan`: lists configured product targets, readiness, local
  artifact paths, and suggested product commands without executing anything.
- `codedecay_product_run`: runs fixed `codedecay product` workflows such as
  flow exploration, generated UI tests, and generated API tests. It requires
  `confirmExecution: true` and writes the JSON report to
  `.codedecay/local/product-runs/latest.json`.
- `codedecay_product_failures`: reads the latest local product report and
  returns agent-ready product failure bundles with expected/actual behavior,
  impacted files, artifacts, and rerun commands.
- `codedecay_product_rerun`: reruns one failed generated UI/API check from the
  latest local product report. It defaults to the first latest failure and uses
  `--test-id` so the rerun targets that check instead of the whole generated
  suite.

Example execution tool input:

```json
{
  "confirmExecution": true,
  "format": "markdown"
}
```

Example product verification input:

```json
{
  "target": "api",
  "generateApiTests": true,
  "runGeneratedApiTests": true,
  "confirmExecution": true,
  "format": "markdown"
}
```

Example failed-check rerun input:

```json
{
  "confirmExecution": true,
  "format": "markdown"
}
```

`codedecay_product_rerun` reads the latest failure from
`.codedecay/local/product-runs/latest.json`. You can also pass `target`,
`testId`, and `checkKind` explicitly.

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
prompt is portable across Codex, Claude Code, Cursor, Pi, OpenCode, desktop
agents, and other MCP clients. The optional `profile` only changes handoff
wording; it does not call or authenticate with that agent. Any proposed fix
still needs verification with tests or configured checks.

`execute_configured_checks`, `codedecay_product_run`, and
`codedecay_product_rerun` are the only MCP tools that can execute local
commands. They never accept command text from MCP input. Configured checks can
only run commands from `.codedecay/config.yml`, `codedecay.config.yml`, or
enabled configured tool adapters such as Agent Process, Playwright, coverage,
StrykerJS, Semgrep, Schemathesis, and Pact. Product tools only invoke the fixed
local `codedecay product` subcommand with structured flags.

Execution requires both:

- MCP input contains `confirmExecution: true`
- CodeDecay config contains `safety.allowCommands: true`

If confirmation is missing, CodeDecay returns a non-executing report. If
`safety.allowCommands` is false, configured checks use the existing skip behavior
and do not run.

Product execution also preserves the product command safety model:

- startup, setup, teardown, browser exploration, and generated test execution
  still require `safety.allowCommands: true`,
- CodeDecay writes only repo-local artifacts under `.codedecay/local/`,
- generated rerun commands include `--test-id` when a failed generated check is
  known,
- no product payloads, screenshots, traces, code, or reports are sent to a
  hosted service by default.
