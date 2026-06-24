# Agent Task Bundles

`codedecay agent` turns a deterministic redteam report into a task bundle for a
user-owned coding agent.

Use it when you want Codex, Claude Code, Cursor, a desktop agent, or another
local agent to fix what CodeDecay found without CodeDecay making a hidden model
call.

```bash
npx codedecay agent --base main --head HEAD --format markdown
npx codedecay agent --profile codex --format markdown
npx codedecay agent --cwd ../my-repo --format json --output codedecay-agent.json
```

The bundle includes:

- a copy-paste prompt for any user-owned coding agent
- changed files, impacted areas, and concrete route/API impacts when available
- weak-test and missing-test proof signals
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

Example prompt style:

```text
Use this CodeDecay agent task bundle as tool evidence.
Fix the listed PR risks.
Do not assume the PR is safe because tests pass.
Add or improve tests that exercise real behavior paths.
After changes, tell me what checks to run.
```

For JSON consumers, route/API evidence is available under
`evidence.impactedRoutes`. Treat it as tool evidence for the agent's fix plan:
the agent should map each proposed fix back to the changed file, route/API, weak
test signal, and missing edge case it addresses.

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
