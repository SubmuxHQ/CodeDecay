# Redteam Reports

`codedecay redteam` packages local PR safety evidence into a report that a
developer or their own coding agent can use before merge.

It asks:

```text
What could this PR break, and what evidence says it is safe?
```

The command is report-only in the current MVP. It does not run configured
commands, does not call an LLM, does not require API keys, does not send
telemetry, and does not depend on CodeDecayCloud.

Use it when you want a local merge-safety brief for Codex, Claude Code, Cursor,
desktop agents, or another user-owned agent. CodeDecay provides deterministic
tool evidence; the receiving agent still has to inspect the code and prove fixes
with tests or configured checks.

## Run

```bash
npx codedecay redteam --base main --head HEAD --format markdown
npx codedecay redteam --cwd ../my-repo --format json
npx codedecay redteam --format markdown --output codedecay-redteam.md
```

Exit codes:

- `0`: report generated and risk is below `--fail-on`, if provided.
- `1`: report generated and risk meets `--fail-on`.
- `2`: CLI/internal error, such as invalid git refs or invalid config.

## What The Report Includes

- changed files and impacted product/system areas
- concrete route/API impacts when CodeDecay can detect them, such as Next.js
  API routes, Next.js UI routes, Express handlers, or Fastify handlers
- merge-risk and decay-risk scores
- test evidence audit status: `missing`, `weak`, `present`, or `not_applicable`
- weak-test and missing-test findings from deterministic rules and runtime
  coverage gaps when present
- deterministic missing edge-case checklist
- local memory summary from `.codedecay/memory.json`
- repo-local agent skill summaries from `.agents/skills/*/SKILL.md`
- configured test/build/start/probe commands that are available but not run
- configured Playwright, StrykerJS, Semgrep, Schemathesis, and Pact tool adapters that
  are planned but not run
- fix tasks for your coding agent
- explicit safety flags showing that commands and models were not called

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
5. Run `codedecay analyze`, `codedecay execute`, or `codedecay differential`
   explicitly when you want static analysis, configured checks, or base/head
   behavior probes.

See [Agent skills](skills.md) for the local skill file format.

## Safety Model

`codedecay redteam` lists configured checks and tool adapter plans from
CodeDecay config, but it does not execute them. Command execution remains
explicit through `codedecay execute` and `codedecay differential`, and those
commands still require `safety.allowCommands: true`.

Model use is also opt-in. The redteam MVP does not call Ollama, LiteLLM, cloud
models, or any hosted CodeDecay service.
