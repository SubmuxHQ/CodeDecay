# Configuration

CodeDecay can load repo-local configuration for red-team orchestration, tool
adapter plans, real behavior probes, and product testing targets.

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
    reportPath: reports/mutation/mutation.json
  schemathesis:
    schema: docs/openapi.yaml
    baseUrl: http://127.0.0.1:3000
  pact:
    command: pnpm run test:pact

productTesting:
  targets:
    web:
      baseUrl: http://127.0.0.1:3000
      startCommand: pnpm dev
      healthCheck: http://127.0.0.1:3000/api/health
      authSetupCommand: pnpm test:auth-seed
      teardownCommand: pnpm stop
      previewUrlEnv: VERCEL_URL
      timeoutMs: 60000

safety:
  commandTimeoutMs: 120000
  allowCommands: false

llm:
  provider: disabled
  timeoutMs: 30000
```

Optional user-owned model providers must be configured explicitly. For a local
LiteLLM or other OpenAI-compatible endpoint:

```yaml
llm:
  provider: litellm
  model: gpt-4.1-mini
  endpoint: http://127.0.0.1:4000/v1
  apiKeyEnv: LITELLM_API_KEY
  timeoutMs: 30000
```

Use `apiKeyEnv` to point at an environment variable name. Do not store literal
API keys in CodeDecay config.

## Product Testing Targets

`productTesting.targets` describes how future product-layer verification should
reach a live app or preview deployment.

Targets are normalized by `codedecay config`, but config inspection never starts
the app, runs setup commands, polls health checks, or performs teardown.

```yaml
productTesting:
  targets:
    web:
      baseUrl: http://127.0.0.1:3000
      healthCheck: http://127.0.0.1:3000/api/health
      timeoutMs: 60000
```

For CI previews, use an environment variable:

```yaml
productTesting:
  targets:
    preview:
      previewUrlEnv: VERCEL_URL
      healthCheck: https://preview.example.com/api/health
```

For local startup, commands remain explicit and gated by `safety.allowCommands`:

```yaml
productTesting:
  targets:
    local:
      startCommand: pnpm dev
      healthCheck: http://127.0.0.1:3000/api/health
      teardownCommand: pnpm stop

safety:
  allowCommands: false
```

With `allowCommands: false`, CodeDecay reports that command approval is needed.
It does not start the app during `config`, `analyze`, `redteam`, or `agent`.

## Safety Model

Config files make project commands explicit. CodeDecay should not guess commands
from model output or run arbitrary commands by default.

Current behavior:

- `codedecay analyze` does not require config.
- `codedecay config` only loads and prints config.
- `codedecay config` can show product target readiness without running target
  commands.
- `codedecay llm-review` is the explicit opt-in path that can call the
  configured user-owned LLM provider.
- `codedecay redteam` lists configured tool adapters as planned local checks,
  but does not run them.
- `codedecay execute` runs only commands and probes from config, and only when
  `safety.allowCommands` is true.
- `codedecay differential` runs only configured probes on temporary base/head
  worktrees, and only when `safety.allowCommands` is true.
- missing config returns safe defaults.
- no telemetry, API keys, LLM calls, or cloud services are used.
- LLM use is disabled by default. LLM-backed commands must opt in
  explicitly and treat model output as untrusted suggestions.

Execution uses this config as its allowlisted command source. See
[Execution probes](execution.md) and
[Differential behavior checks](differential.md).

Tool adapters are also configured here. See [Tool adapters](tool-adapters.md)
for Playwright, StrykerJS, Schemathesis, and Pact adapter details.

Read [Product Testing](product-testing.md) for the failure bundle schema and the
roadmap toward local-first UI/API verification.

Read [LLM providers](llm-providers.md) for optional local/BYOK model adapters.
