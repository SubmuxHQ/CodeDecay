# Agent Task Bundles

`codedecay agent` turns a deterministic redteam report into a task bundle for a
user-owned coding agent.

Use it when you want Codex, Claude Code, Cursor, Pi, OpenCode, a desktop agent,
or another local agent to fix what CodeDecay found without CodeDecay making a
hidden model call.

```bash
npx codedecay agent --base main --head HEAD --format markdown
npx codedecay agent --profile codex --format markdown
npx codedecay agent --cwd ../my-repo --format json --output codedecay-agent.json
```

The bundle includes:

- a copy-paste prompt for any user-owned coding agent
- changed files, impacted areas, and concrete route/API impacts when available
- weak-test and missing-test evidence signals
- product verification failures from `.codedecay/local/product-runs/latest.json`
  when that artifact exists
- merge-risk and decay-risk breakdowns plus runtime test evidence, when present
- edge cases to check
- configured checks and tool adapters that are available but not run
- tasks for the coding agent
- repo-local skill summaries
- safety and limitation notes

## Agent Profiles

Profiles only shape the handoff instructions. They do not make CodeDecay call
the selected agent, call an LLM, require API keys, or send code anywhere.

Supported profiles:

- `generic`: portable bundle for any user-owned agent.
- `codex`: handoff wording for a Codex repo session.
- `claude-code`: handoff wording for Claude Code.
- `cursor`: handoff wording for Cursor chat or agent mode.
- `pi`: handoff wording for Pi harness or Pi-compatible agent workflows.
- `opencode`: handoff wording for OpenCode.
- `desktop`: handoff wording for desktop or local agent apps.

Example:

```bash
npx codedecay agent --profile cursor --format markdown --output codedecay-agent.md
```

## How To Use

1. Run `codedecay agent`.
2. Copy the prompt from the `Copy-Paste Prompt` section.
3. Give the prompt and Markdown or JSON output to your agent.
4. Ask the agent to start from impacted routes/APIs and explain what real user,
   API, database, or downstream path could break.
5. Ask the agent to complete the listed tasks with real tests and behavior
   checks.
6. Run CodeDecay again.

## Product Verification Loop

Agent bundles are report-only, but they can include the latest product
verification failures created by `codedecay product` or the MCP product tools.

```bash
npx codedecay product --target api --generate-api-tests --run-generated-api-tests --format json --output .codedecay/local/product-runs/latest.json
npx codedecay agent --profile codex --format markdown --output codedecay-agent.md
```

When `.codedecay/local/product-runs/latest.json` exists, `codedecay agent`
converts generated UI/API failures into product failure bundles and fix tasks.
Those tasks include:

- failed check ID and target,
- expected and actual behavior,
- impacted files when available,
- generated test source artifact,
- rerun command for the specific failed check.

Generated test rerun commands use `--test-id`:

```bash
npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown
```

This lets Codex, Claude Code, Cursor, OpenCode, or another local agent fix a
failure and rerun the failed generated check without running the entire generated
suite by default.

Example prompt style:

```text
Use this CodeDecay agent task bundle as tool evidence.
Fix the listed PR risks.
Do not assume the PR is safe because tests pass.
Add or improve tests that exercise real behavior paths.
After changes, tell me what checks to run.
```

For JSON consumers, route/API evidence is available under
`evidence.impactedRoutes`. Score contributors are available under
`evidence.summary.mergeRiskBreakdown` and `evidence.summary.decayBreakdown`, and
runtime-backed coverage state is available under `evidence.testEvidence`. Treat
these as tool evidence for the agent's fix plan: the agent should map each
proposed fix back to the changed file, route/API, score contributor, weak test
signal, and missing edge case it addresses.

## Safety

`codedecay agent` is report-only.

It does not:

- call an LLM or hosted model
- execute commands
- send telemetry
- require API keys
- depend on CodeDecayCloud

Agent output is not trusted evidence by itself. Treat the agent's response as a
proposal until it is verified by tests, configured checks, or manual review.
