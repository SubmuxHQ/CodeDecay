# Tool Adapters

CodeDecay should use existing open-source tools instead of rebuilding their
capabilities. Tool adapters normalize local tool execution into CodeDecay
harness evidence.

The first adapter is Playwright for browser/user-flow checks.

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

## Future Adapters

The same package can add adapters for StrykerJS, Schemathesis, Pact, coverage
tools, and test runners. Each adapter should use safe configured execution and
return evidence rather than bypassing CodeDecay safety rules.
