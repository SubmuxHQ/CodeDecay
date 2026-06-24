# Configuration

CodeDecay can load repo-local configuration for red-team orchestration, tool
adapter plans, and real behavior probes.

Configuration is optional. If no config file exists, CodeDecay uses safe
defaults and does not run project commands.

## Supported Files

CodeDecay discovers the first matching file from the analysis working directory:

- `.codedecay/config.yml`
- `.codedecay/config.yaml`
- `codedecay.config.yml`
- `codedecay.config.yaml`

Use `--cwd` to inspect another repository:

```bash
npx codedecay config --cwd ../my-repo --format markdown
```

## Example

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
  playwright: true
  stryker:
    command: pnpm exec stryker run
  schemathesis:
    schema: docs/openapi.yaml
    baseUrl: http://127.0.0.1:3000
  pact:
    command: pnpm run test:pact

safety:
  commandTimeoutMs: 120000
  allowCommands: false

llm:
  provider: disabled
  timeoutMs: 30000
```

## Safety Model

Config files make project commands explicit. CodeDecay should not guess commands
from model output or run arbitrary commands by default.

Current behavior:

- `codedecay analyze` does not require config.
- `codedecay config` only loads and prints config.
- `codedecay redteam` lists configured tool adapters as planned local checks,
  but does not run them.
- `codedecay execute` runs only commands and probes from config, and only when
  `safety.allowCommands` is true.
- `codedecay differential` runs only configured probes on temporary base/head
  worktrees, and only when `safety.allowCommands` is true.
- missing config returns safe defaults.
- no telemetry, API keys, LLM calls, or cloud services are used.
- LLM use is disabled by default. Future LLM-backed commands must opt in
  explicitly and treat model output as untrusted suggestions.

Execution uses this config as its allowlisted command source. See
[Execution probes](execution.md) and
[Differential behavior checks](differential.md).

Tool adapters are also configured here. See [Tool adapters](tool-adapters.md)
for Playwright, StrykerJS, Schemathesis, and Pact adapter details.

Read [LLM providers](llm-providers.md) for the optional local/BYOK model
adapter direction.
