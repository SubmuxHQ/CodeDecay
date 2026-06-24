# Next.js Risk Demo

This is a small Next.js-style example for trying CodeDecay on a realistic pull
request shape without setting up a full application.

The generated baseline project includes:

- an App Router UI page: `src/app/dashboard/page.tsx`
- an App Router API route: `src/app/api/users/route.ts`
- an auth/session helper: `src/lib/auth/session.ts`
- a Prisma schema: `prisma/schema.prisma`
- a Next.js config file: `next.config.js`

The included `scripts/materialize.mjs` script writes either the baseline files
or the risky PR version from the snapshots under `scenarios/`.

The risky scenario changes those files in ways CodeDecay should flag:

- API route behavior changes without test updates.
- Auth/session behavior becomes more permissive.
- Prisma schema changes affect persisted data.
- Next.js build config starts ignoring type and lint failures.
- UI route output changes.

## Run The Example

From the repository root:

```sh
cd examples/nextjs-risk-demo
node scripts/materialize.mjs baseline
git init
git config user.name "CodeDecay Example"
git config user.email "codedecay@example.com"
git add .
git commit -m "baseline Next.js example"
node scripts/materialize.mjs risky
node ../../packages/cli/dist/index.js analyze --cwd . --format markdown
node ../../packages/cli/dist/index.js redteam --cwd . --format markdown
node ../../packages/cli/dist/index.js agent --cwd . --format markdown
```

After CodeDecay is installed from npm, use `npx codedecay` instead of the local
`node ../../packages/cli/dist/index.js` command.

To write JSON or SARIF:

```sh
node ../../packages/cli/dist/index.js analyze --cwd . --format json --output codedecay.json
node ../../packages/cli/dist/index.js analyze --cwd . --format sarif --output codedecay.sarif
```

Relative `--output` paths are written inside `--cwd`.

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
diff touches API, auth, database/schema, config, and UI areas without changing
nearby tests.

Expected score summary:

- Overall risk: high
- Merge risk score: `100/100`
- Decay score: `62/100`
- Findings: 5 high, 4 medium, 0 low

Expected high-signal findings include:

- `missing-nearby-tests`
- `risky-api-change`
- `risky-auth-change`
- `risky-database-change`
- `risky-config-change`
- `risky-ui-change`
- `broad-unrelated-change`
- `typescript-any`
- `silent-failure`

CodeDecay runs locally for this example. It does not need telemetry, API keys,
LLM calls, model calls, or a cloud service.
