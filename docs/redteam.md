# Redteam Reports

`codedecay redteam` packages local PR safety evidence into a report that a
developer or their own coding agent can use before merge.

It asks:

```text
What could this PR break, and what evidence says it is safe?
```

The command is report-only by default. It does not run configured commands
unless `--with-checks` is passed, does not call an LLM unless investigation is
explicitly requested, does not require API keys, does not send telemetry, and
does not depend on CodeDecayCloud.

Use it when you want a local merge-safety brief for Codex, Claude Code, Cursor,
desktop agents, or another user-owned agent. CodeDecay provides deterministic
deterministic signals and optional tool evidence; the receiving agent still has
to inspect the code and prove fixes with tests or configured checks.

## Run

```bash
npx codedecay redteam --base main --head HEAD --format markdown
npx codedecay redteam --with-checks --base main --head HEAD --format markdown
npx codedecay redteam --cwd ../my-repo --format json
npx codedecay redteam --format markdown --output codedecay-redteam.md
```

Exit codes:

- `0`: report generated and risk is below `--fail-on`, if provided.
- `1`: report generated and risk meets `--fail-on`, or `--with-checks`
  produced failed or blocked verification.
- `2`: CLI/internal error, such as invalid git refs or invalid config.

## What The Report Includes

- changed files and impacted product/system areas
- concrete route/API impacts when CodeDecay can detect them, such as Next.js
  API routes, Next.js UI routes, Express handlers, or Fastify handlers
- symbol-level impact evidence for changed JS/TS exports, including direct
  importers, likely tests, and route/API files when detected
- merge-risk and decay-risk scores
- changed-path proof entries that label changed production paths as
  runtime-proven, static-only, weakened by mocks, or unproven
- test evidence audit status: `missing`, `weak`, `present`, or `not_applicable`
- weak-test and missing-test findings from deterministic rules and runtime
  coverage gaps when present
- deterministic missing edge-case checklist
- verification status from configured execution checks when `--with-checks` is
  used
- base/head differential probe and API contract evidence when `--with-checks`,
  `--base`, and `--head` are provided and probes or OpenAPI contracts are
  configured
- local memory summary from `.codedecay/memory.json`
- repo-local agent skill summaries from `.agents/skills/*/SKILL.md`
- configured test/build/start/probe commands and configured Agent Process,
  Playwright, coverage, StrykerJS, Semgrep, Schemathesis, and Pact tool adapters
  as planned checks by default or executed verification evidence with
  `--with-checks`
- breaking API contract changes with route, method, status code, schema path,
  base/head evidence, and suggested proof checks such as Schemathesis, Pact, or
  client contract tests
- fix tasks for your coding agent
- explicit safety flags showing that commands and models were not called

## Evidence Grades

Redteam reports label each fix task and verification check so heuristic risk is
not confused with proof:

| Grade | Use it as |
| --- | --- |
| `tool-evidence` | Output from a configured command, probe, product check, coverage artifact, or tool adapter. |
| `deterministic-signal` | Static/diff evidence from CodeDecay, such as a risky route or changed auth file. |
| `missing-proof` | A path that still needs a real test/check, or a configured check that was skipped or blocked. |
| `memory-context` | Local memory or past-regression context that guides review but is not proof by itself. |
| `agent-suggestion` | Pattern-pack or AI/agent guidance that must be verified before merge. |

The summary `verificationStatus` is:

- `not-run`: no execution checks were requested.
- `verified`: every configured check included in the report passed.
- `unverified`: checks were absent or skipped, so behavior was not proven.
- `failed`: at least one configured check failed, timed out, or errored.
- `blocked`: CodeDecay refused at least one configured command for safety.

If no changed files are detected, CodeDecay reports zero PR-specific edge cases
and zero coding-agent fix tasks instead of fabricating a redteam checklist.

## Agent-Agnostic Workflow

CodeDecay does not replace Codex, Claude Code, Cursor, Pi, OpenCode, desktop
agents, or internal agents. Use it to give those tools better evidence.

Suggested workflow:

1. Run `codedecay redteam --format markdown`.
2. Start with the impacted route/API section and ask what real user/API path
   reaches each changed file.
3. Paste or attach the report to your coding agent.
4. Ask the agent to fix the high-risk findings and add real checks for the
   impacted routes, missing edge cases, and weak-test findings.
5. Run `codedecay redteam --with-checks --base main --head HEAD`,
   `codedecay execute`, or `codedecay differential` explicitly when you want
   configured checks, base/head behavior probes, or API contract diffs.

See [Agent skills](skills.md) for the local skill file format.

## Safety Model

`codedecay redteam` lists configured checks and tool adapter plans from
CodeDecay config by default. It executes them only when `--with-checks` is
provided, and execution still requires commands to come from CodeDecay config
and pass the same safety policy used by `codedecay execute`. Command execution
also remains available through `codedecay execute` and `codedecay differential`,
and those commands still require `safety.allowCommands: true`.

Model use is also opt-in. Redteam does not call Ollama, LiteLLM, cloud models,
or any hosted CodeDecay service unless the user invokes an explicit
investigation path.
