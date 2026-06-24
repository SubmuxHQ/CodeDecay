# Tool Adapters

CodeDecay should use existing open-source tools instead of rebuilding their
capabilities. Tool adapters normalize local tool execution into CodeDecay
harness evidence.

The first adapters are:

- Playwright for browser/user-flow checks.
- StrykerJS for mutation-testing evidence.
- Schemathesis for OpenAPI/GraphQL API fuzzing evidence.
- Pact for contract-testing evidence.

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

## StrykerJS Harness

The StrykerJS harness is also a private internal package API for now:

```ts
createStrykerHarness({
  command: "pnpm exec stryker run",
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
