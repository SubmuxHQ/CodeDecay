# Agent Task Bundles

`codedecay ai` is the recommended AI-first workflow. It turns a deterministic
redteam report into a task bundle for a user-owned coding agent and defaults to
Codex handoff wording.

Use it when you want Codex, Claude Code, Cursor, Pi, OpenCode, a desktop agent,
or another local agent to fix what CodeDecay found without CodeDecay making a
hidden model call.

```bash
npx codedecay ai --base main --head HEAD --format markdown
npx codedecay ai --profile claude-code --format markdown
npx codedecay ai --with-checks --base main --head HEAD --format markdown
npx codedecay agent --base main --head HEAD --format markdown
npx codedecay agent --profile codex --format markdown
npx codedecay agent preflight --task "Add a GET /api/users export endpoint" --format markdown
npx codedecay agent --cwd ../my-repo --format json --output codedecay-agent.json
```

`codedecay agent` remains the lower-level report-only bundle command with a
generic profile default. `codedecay ai` is the product workflow most developers
should start with.

## Preflight Before Code Generation

Use `codedecay agent preflight` before a coding agent starts editing. It does
not require a git diff, run configured commands, call models, or send telemetry.

```bash
npx codedecay agent preflight \
  --task "Add a dashboard filter for reviewed uploads" \
  --format markdown
```

The preflight report separates deterministic repo evidence from suggestions:

- likely impacted areas from the task description
- candidate files and route/API surfaces from repo paths
- matched local memory, invariants, architecture notes, and regressions
- matched design-contract boundaries
- configured checks listed as follow-up proof with `willRun=false`
- proof plan and non-goals for the receiving agent

Treat preflight as a before-coding brief. After the agent edits code, run
`codedecay redteam`, `codedecay agent`, and the relevant project checks to
gather merge evidence.

The bundle includes:

- a copy-paste prompt for any user-owned coding agent
- changed files, impacted areas, and concrete route/API impacts when available
- symbol-level import impacts for changed JS/TS exports when available
- changed-path proof entries with repair tasks for runtime-unproven,
  static-only, or mocked-boundary tests
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

## Optional Local Agent Process

If you want CodeDecay to run a user-owned local agent CLI under the same command
safety policy as other tool adapters, configure `toolAdapters.agentProcess`.

```yaml
toolAdapters:
  agentProcess:
    command: node scripts/local-agent-harness.js
    profile: codex
    bundleFormat: markdown

safety:
  allowCommands: true
```

Then run:

```bash
npx codedecay execute --format markdown
```

CodeDecay writes `.codedecay/local/agent-process/bundle.md` or `bundle.json`,
sets `CODEDECAY_AGENT_BUNDLE_PATH`, runs the configured command, and records the
agent output as untrusted `agent-suggestion` evidence. The output is not treated
as proof until verified by tests, static tools, or human review.

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
npx codedecay ai --profile codex --format markdown --output codedecay-ai.md
```

When `.codedecay/local/product-runs/latest.json` exists, `codedecay ai`
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
