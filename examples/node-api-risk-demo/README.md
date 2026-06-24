# Node API Risk Demo

This is a small Express-style API example for trying CodeDecay on a backend pull
request shape.

The generated baseline project includes:

- an API route: `src/routes/users.ts`
- an auth/session helper: `src/auth/session.ts`
- a database/schema module: `src/db/schema.ts`
- a runtime config module: `src/config/runtime.ts`
- a package manifest: `package.json`

The included `scripts/materialize.mjs` script writes either the baseline files
or the risky PR version from the snapshots under `scenarios/`.

The risky scenario changes those files in ways CodeDecay should flag:

- API route behavior changes without test updates.
- Auth/session behavior becomes more permissive.
- Database defaults and fields change.
- Runtime/package configuration changes.
- TypeScript escape hatches and silent failure paths are introduced.

The example also materializes `.codedecay/config.yml` with explicit local
commands and tool adapter commands:

- `commands.test`: a small route smoke check.
- `toolAdapters.playwright`: a dependency-free user-flow smoke script.
- `toolAdapters.pact`: a dependency-free contract smoke script that fails on
  the risky auth/schema change.

## Run The Example

From a source checkout after `pnpm build`:

```sh
cd examples/node-api-risk-demo
node scripts/materialize.mjs baseline
git init
git config user.name "CodeDecay Example"
git config user.email "codedecay@example.com"
git add .
git commit -m "baseline Node API example"
node scripts/materialize.mjs risky
node ../../packages/cli/dist/index.js analyze --cwd . --format markdown
node ../../packages/cli/dist/index.js redteam --cwd . --format markdown
node ../../packages/cli/dist/index.js agent --cwd . --format markdown
```

The included `codedecay:*` npm scripts use the same source-checkout CLI path,
so run `pnpm build` from the repository root before using them.

After CodeDecay is installed from npm, use `npx codedecay` instead of the local
`node ../../packages/cli/dist/index.js` command.

To write JSON or SARIF analysis reports:

```sh
node ../../packages/cli/dist/index.js analyze --cwd . --format json --output codedecay.json
node ../../packages/cli/dist/index.js analyze --cwd . --format sarif --output codedecay.sarif
```

Relative `--output` paths are written inside `--cwd`.

## Run Configured Checks

The example config enables local command execution so `codedecay execute` can
run the explicit smoke commands:

```sh
node ../../packages/cli/dist/index.js execute --cwd . --format markdown
```

Expected result for the risky scenario:

- exit code: `1`
- unit smoke: passed
- user-flow smoke: passed
- contract smoke: failed

The failing contract smoke is intentional. It catches that the risky PR makes
exports available to any authenticated user and changes the default user role to
`ADMIN`.

## Hand The Bundle To Your Agent

Use the agent bundle when you want Codex, Claude Code, Cursor, or another
user-owned coding agent to fix the risky PR with tool evidence:

```sh
node ../../packages/cli/dist/index.js agent --cwd . --format markdown --output codedecay-agent.md
```

The bundle is report-only. CodeDecay does not execute commands, call an LLM,
send telemetry, or require CodeDecayCloud while creating it.

## Expected Summary

The exact timestamp will vary, but the report should be high risk because the
diff touches API, auth, database/schema, and config areas without changing tests.

Expected score summary:

- Overall risk: high
- Merge risk score: `100/100`
- Decay score: `62/100`
- Findings: 5 high, 3 medium, 1 low

Expected high-signal findings include:

- `missing-nearby-tests`
- `risky-api-change`
- `risky-auth-change`
- `risky-database-change`
- `risky-config-change`
- `broad-unrelated-change`
- `typescript-any`
- `silent-failure`
- `risky-source-change`

CodeDecay runs locally for this example. It does not need telemetry, API keys,
LLM calls, model calls, or a cloud service.
