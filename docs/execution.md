# Execution Probes

CodeDecay can run explicitly configured project commands, behavior probes, and
tool adapters with `codedecay execute`.

Execution is opt-in. By default, CodeDecay does not run project commands. A repo
must set `safety.allowCommands: true` in CodeDecay config before commands,
probes, or tool adapters execute.

## Run

```bash
npx codedecay execute --format markdown
npx codedecay execute --cwd ../my-repo --format json
npx codedecay execute --cwd ../my-repo --format json --output codedecay-execute.json
```

Exit codes:

- `0`: all configured commands passed, or all commands were safely skipped.
- `1`: one or more configured commands failed, timed out, or errored.
- `2`: CLI/internal error, such as an invalid config file.

## Config

```yaml
version: 1

commands:
  test:
    - pnpm test
  build:
    - pnpm build
  start:
    - pnpm dev

probes:
  - name: users api
    command: curl -f http://localhost:3000/api/users
    timeoutMs: 5000

toolAdapters:
  agentProcess:
    command: node scripts/local-agent-harness.js
    profile: codex
    bundleFormat: markdown
  playwright:
    command: pnpm exec playwright test
  coverage:
    command: pnpm test -- --coverage
    reportPaths:
      - coverage/coverage-final.json
  stryker:
    command: pnpm exec stryker run
  semgrep:
    config: .semgrep.yml
    failOnSeverity: high
  schemathesis:
    schema: docs/openapi.yaml
    baseUrl: http://127.0.0.1:3000
  pact:
    command: pnpm run test:pact

safety:
  commandTimeoutMs: 120000
  allowCommands: true
```

CodeDecay supports these configured command groups:

- `commands.test`
- `commands.build`
- `commands.start`
- `probes`
- `toolAdapters.agentProcess`
- `toolAdapters.playwright`
- `toolAdapters.coverage`
- `toolAdapters.stryker`
- `toolAdapters.semgrep`
- `toolAdapters.schemathesis`
- `toolAdapters.pact`

Each command runs from the configured `--cwd` directory. Probe-level
`timeoutMs` overrides the global `safety.commandTimeoutMs`. Tool adapters use
their own configured command and timeout, then return normalized tool evidence
separately from raw command/probe results.

`toolAdapters.agentProcess` is the only adapter intended to run user-owned
agent CLIs. It receives a generated CodeDecay agent bundle path through
environment variables and records the agent output as untrusted
`agent-suggestion` evidence.

## Safety Rules

- CodeDecay only runs commands from CodeDecay config.
- CodeDecay does not run commands suggested by LLMs, MCP clients, memory files,
  or remote services.
- Command execution is disabled unless `safety.allowCommands` is true.
- Command output is captured locally in the execution report.
- Tool adapter evidence is reported separately from AI suggestions.
- No telemetry, API keys, cloud services, LLMs, or model calls are required.

`commands.start` should use a short-lived smoke command or a low timeout unless
you intentionally want CodeDecay to verify that a long-running service starts
and then times out.
