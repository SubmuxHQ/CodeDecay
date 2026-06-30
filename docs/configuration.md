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
  agentProcess:
    command: node scripts/local-agent-harness.js
    profile: codex
    bundleFormat: markdown
  playwright: true
  stryker:
    command: pnpm exec stryker run
    reportPath: reports/mutation/mutation.json
  coverage:
    command: pnpm test -- --coverage
    reportPaths:
      - coverage/coverage-final.json
    failOn: uncovered
  semgrep:
    config: .semgrep.yml
    failOnSeverity: high
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

memoryProviders:
  providers:
    - local
    # Optional external memory providers are opt-in.
    # They are not used by deterministic analyze defaults.
    - provider: mem0
      enabled: false
      endpoint: http://127.0.0.1:8000
      apiKeyEnv: MEM0_API_KEY
    - provider: supermemory
      enabled: false
      endpoint: http://127.0.0.1:3001
      apiKeyEnv: SUPERMEMORY_API_KEY
      collection: codedecay
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

## Memory Providers

CodeDecay uses local repo memory by default:

```yaml
memoryProviders:
  providers:
    - local
```

The local provider reads `.codedecay/memory.json` and does not require network
access, API keys, hosted services, or model calls.

External memory providers are explicit opt-ins for future Mem0 and Supermemory
adapters. Configure them only when you want CodeDecay to use user-owned memory
systems in red-team or agent workflows:

```yaml
memoryProviders:
  providers:
    - local
    - provider: mem0
      endpoint: http://127.0.0.1:8000
      apiKeyEnv: MEM0_API_KEY
      projectId: codedecay
    - provider: supermemory
      endpoint: http://127.0.0.1:3001
      apiKeyEnv: SUPERMEMORY_API_KEY
      collection: codedecay
```

`apiKeyEnv` must be an environment variable name. Do not store literal tokens in
config. External memory context must remain separate from deterministic tool
evidence and must not change local-only `codedecay analyze` defaults.

## Product Testing Targets

`productTesting.targets` describes how product-layer verification should reach a
live app or preview deployment.

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
      timeoutMs: 60000
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

For API verification without an OpenAPI file, configure endpoint scenarios on
the target:

```yaml
productTesting:
  targets:
    api:
      baseUrl: http://127.0.0.1:3000
      healthCheck: http://127.0.0.1:3000/health
      apiEndpoints:
        - id: list-users
          method: GET
          path: /api/users
          expectedStatuses: [200, 401]
        - method: POST
          path: /api/users
          expectedStatuses: [201, 400]
          body:
            email: codedecay@example.com
```

Run the configured targets explicitly with:

```bash
npx codedecay product --format markdown
npx codedecay product --target local --format json
```

With `allowCommands: false`, CodeDecay reports that command approval is needed
and does not start the app. With `allowCommands: true`, `codedecay product` can
run `authSetupCommand`, start the app, poll the health URL, stop the managed
process, and run `teardownCommand`.

It never starts the app during `config`, `analyze`, `redteam`, or `agent`.

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
- `codedecay product` checks configured live app targets. It only runs setup,
  startup, and teardown commands when `safety.allowCommands` is true.
- missing config returns safe defaults.
- no telemetry, API keys, LLM calls, or cloud services are used.
- LLM use is disabled by default. LLM-backed commands must opt in
  explicitly and treat model output as untrusted suggestions.

Execution uses this config as its allowlisted command source. See
[Execution probes](execution.md) and
[Differential behavior checks](differential.md).

Tool adapters are also configured here. See [Tool adapters](tool-adapters.md)
for Agent Process, Playwright, coverage, StrykerJS, Semgrep, Schemathesis, and
Pact adapter details.

Read [Product Testing](product-testing.md) for the failure bundle schema and the
roadmap toward local-first UI/API verification.

Read [LLM providers](llm-providers.md) for optional local/BYOK model adapters.
