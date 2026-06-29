# Tool Adapters

CodeDecay should use existing open-source tools instead of rebuilding their
capabilities. Tool adapters normalize local tool execution into CodeDecay
harness evidence.

The first adapters are:

- Agent Process for local Codex, Claude Code, Pi, OpenCode, OpenClaw/Hermes,
  or other user-owned agent harness commands.
- Playwright for browser/user-flow checks.
- Coverage for local test coverage artifacts.
- StrykerJS for mutation-testing evidence.
- Semgrep for multi-language static bug/security evidence.
- Schemathesis for OpenAPI/GraphQL API fuzzing evidence.
- Pact for contract-testing evidence.
- OSV-Scanner and OpenSSF Scorecard as recommended external security checks
  where useful; these are not run by default.

## Discovering Tools

Run `codedecay doctor` to inspect the local repo and recommend mature OSS tools
that fit the detected framework, tests, API schema, CI, and package manager.

```bash
npx codedecay doctor
npx codedecay doctor --format json
npx codedecay doctor --write-config-preview
```

Doctor is recommendation-only:

- no tools are installed,
- no commands are executed,
- no network calls are made,
- no LLM/model calls are made,
- `.codedecay/config.yml` is not modified.

When `--write-config-preview` is used, CodeDecay writes a reviewable preview to
`.codedecay/local/config-preview.yml`. Copy only the parts you want into tracked
config.

## Configuring Adapters

Adapters are configured in CodeDecay config. `codedecay redteam` lists adapter
plans but does not run them.

```yaml
version: 1

toolAdapters:
  agentProcess:
    command: codex exec "$(cat \"$CODEDECAY_AGENT_BUNDLE_PATH\")"
    profile: codex
    bundleFormat: markdown
  playwright: true
  coverage:
    command: pnpm test -- --coverage
    reportPaths:
      - coverage/coverage-final.json
    failOn: uncovered
  stryker:
    command: pnpm exec stryker run
    reportPath: reports/mutation/mutation.json
  semgrep:
    config: .semgrep.yml
    failOnSeverity: high
  schemathesis:
    schema: docs/openapi.yaml
    baseUrl: http://127.0.0.1:3000
  pact:
    command: pnpm run test:pact

safety:
  allowCommands: false
```

Set `safety.allowCommands: true` only for explicit execution commands. Redteam
reports remain report-only even when adapter plans are configured.

## Agent Process Harness

The Agent Process harness runs one explicitly configured local agent command and
captures the output as untrusted `agent-suggestion` evidence.

Use it when you already have a local Codex, Claude Code, Pi, OpenCode,
OpenClaw/Hermes, or custom OSS agent harness CLI and want CodeDecay to hand it a
deterministic task bundle during `codedecay execute` or MCP
`execute_configured_checks`.

```yaml
toolAdapters:
  agentProcess:
    command: node scripts/local-agent-harness.js
    profile: claude-code
    bundleFormat: markdown

safety:
  allowCommands: true
```

Before running the command, CodeDecay writes a bundle under:

```text
.codedecay/local/agent-process/bundle.md
```

or, when `bundleFormat: json`:

```text
.codedecay/local/agent-process/bundle.json
```

The configured command receives:

- `CODEDECAY_AGENT_BUNDLE_PATH`: absolute path to the generated bundle.
- `CODEDECAY_AGENT_BUNDLE_RELATIVE_PATH`: repo-relative bundle path.
- `CODEDECAY_AGENT_BUNDLE_FORMAT`: `markdown` or `json`.
- `CODEDECAY_AGENT_PROFILE`: `generic`, `codex`, `claude-code`, `cursor`,
  `pi`, `opencode`, or `desktop`.
- `CODEDECAY_AGENT_OUTPUT_UNTRUSTED`: always `1`.

Safety defaults:

- no command runs unless `safety.allowCommands: true`,
- there is no default agent command,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- CodeDecay does not install or authenticate agent CLIs,
- agent output is `trusted: false` and must be verified by tests, static tools,
  or human review.

## Playwright Harness

The Playwright harness is a private internal package API for now:

```ts
createPlaywrightHarness({
  command: "pnpm exec playwright test",
  allowCommands: true
});
```

Safety defaults:

- command execution is disabled unless `allowCommands: true` is provided,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- Playwright is not installed by CodeDecay,
- browsers are not installed by CodeDecay,
- no telemetry, LLM calls, API keys, or CodeDecayCloud dependency are used.

The default command is:

```bash
pnpm exec playwright test
```

Projects can override the command when they already have their own Playwright
script, shard, config file, or browser setup.

## Coverage Harness

The coverage harness is also a private internal package API for now:

```ts
createCoverageHarness({
  command: "pnpm test -- --coverage",
  reportPaths: ["coverage/coverage-final.json"],
  failOn: "uncovered",
  allowCommands: true
});
```

Safety defaults:

- command execution is disabled unless `allowCommands: true` is provided,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- coverage tools are not installed by CodeDecay,
- no telemetry, LLM calls, API keys, or CodeDecayCloud dependency are used.

Projects own the test runner and coverage command:

```yaml
toolAdapters:
  coverage:
    command: pnpm test -- --coverage
    reportPaths:
      - coverage/coverage-final.json
      - coverage/lcov.info
    failOn: uncovered
```

If `command` is omitted, CodeDecay only collects existing local artifacts.
Supported artifact formats are Istanbul `coverage-final.json`, LCOV
`lcov.info`, and V8 JSON coverage. The adapter defaults to evidence-only mode;
set `failOn: uncovered` to fail when measured lines are uncovered.

## StrykerJS Harness

The StrykerJS harness is also a private internal package API for now:

```ts
createStrykerHarness({
  command: "pnpm exec stryker run",
  reportPath: "reports/mutation/mutation.json",
  allowCommands: true
});
```

Safety defaults:

- command execution is disabled unless `allowCommands: true` is provided,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- StrykerJS is not installed by CodeDecay,
- no telemetry, LLM calls, API keys, or CodeDecayCloud dependency are used.

The default command is:

```bash
pnpm exec stryker run
```

Projects can override the command when they already have their own Stryker
script, mutation score threshold, or package manager setup.

When `reportPath` exists, CodeDecay parses the StrykerJS JSON mutation report
after command execution. Surviving and no-coverage mutants become concrete
`mutation` evidence with file, line, mutator name, and report artifact path.

The default report path is:

```text
reports/mutation/mutation.json
```

StrykerJS must be configured by the project to write that JSON report, or the
project can point CodeDecay at another local report path:

```yaml
toolAdapters:
  stryker:
    command: pnpm exec stryker run
    reportPath: tmp/stryker-mutation.json
```

## Semgrep Harness

The Semgrep harness is also a private internal package API for now:

```ts
createSemgrepHarness({
  config: ".semgrep.yml",
  failOnSeverity: "high",
  allowCommands: true
});
```

Safety defaults:

- command execution is disabled unless `allowCommands: true` is provided,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- Semgrep is not installed by CodeDecay,
- Semgrep Registry, `semgrep ci`, and remote configs are not used by default,
- no telemetry, LLM calls, API keys, or CodeDecayCloud dependency are used.

The generated local-first command is:

```bash
semgrep scan --config .semgrep.yml --json --metrics=off --disable-version-check
```

If `toolAdapters.semgrep: true` is configured without a command or config,
CodeDecay only runs Semgrep when it discovers a local `.semgrep.yml`,
`.semgrep.yaml`, `.semgrep/`, `semgrep.yml`, or `semgrep.yaml` config.

Projects can override the full command when they intentionally want a custom
entry point, package manager wrapper, Semgrep Registry config, or `semgrep ci`:

```yaml
toolAdapters:
  semgrep:
    command: pnpm exec semgrep scan --config p/ci --json --metrics=off
    failOnSeverity: medium
```

When Semgrep JSON is available on stdout or at `reportPath`, CodeDecay parses
findings into `static-analysis` evidence with rule id, message, file, line,
severity, and selected metadata. Findings at or above `failOnSeverity` fail the
adapter result. The default threshold is `high`.

## Schemathesis Harness

The Schemathesis harness is also a private internal package API for now:

```ts
createSchemathesisHarness({
  schema: "openapi.yaml",
  baseUrl: "http://127.0.0.1:3000",
  allowCommands: true
});
```

Safety defaults:

- command execution is disabled unless `allowCommands: true` is provided,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- Schemathesis is not installed by CodeDecay,
- API servers are not started by CodeDecay,
- no telemetry, LLM calls, API keys, or CodeDecayCloud dependency are used.

The default command is:

```bash
st run openapi.yaml --url http://127.0.0.1:3000
```

Projects can override the full command when they already use a different
Schemathesis entry point, package manager, schema location, base URL, or
service startup flow:

```ts
createSchemathesisHarness({
  command: "uvx schemathesis run docs/openapi.yaml --url http://127.0.0.1:4000",
  allowCommands: true
});
```

## Pact Harness

The Pact harness is also a private internal package API for now:

```ts
createPactHarness({
  command: "pnpm run test:pact",
  allowCommands: true
});
```

Safety defaults:

- command execution is disabled unless `allowCommands: true` is provided,
- commands go through `@submuxhq/codedecay-execution`,
- unsafe commands are blocked by the shared safety policy,
- Pact is not installed by CodeDecay,
- Pact Broker or PactFlow are not required by CodeDecay,
- no telemetry, LLM calls, API keys, or CodeDecayCloud dependency are used.

The default command is:

```bash
pnpm run test:pact
```

Projects can override the command when they already have their own Pact
consumer/provider test script, local pact file setup, or broker-backed CI flow.

## Future Adapters

The same package can add adapters for coverage tools and test runners. Each
adapter should use safe configured execution and return evidence rather than
bypassing CodeDecay safety rules.
