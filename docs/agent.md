# Agent Task Bundles

`codedecay session` is the recommended AI-native workflow when a coding agent
needs guidance before editing, during partial work, and at final verification.
It creates a durable `.codedecay/local/agent-sessions/<id>.json` artifact that
keeps the task, requirements, base revision, context evidence, checkpoints, and
proof obligations together.

`codedecay ai` is still the recommended one-shot workflow for turning CodeDecay
evidence into a Codex-ready task bundle. `codedecay agent` remains the
lower-level equivalent with a generic profile default.

Use it when you want Codex, Claude Code, Cursor, Pi, OpenCode, a desktop agent,
or another local agent to fix what CodeDecay found without CodeDecay making a
hidden model call.

Use `codedecay context` when the agent needs a bounded, task-scoped slice of
routes, files, tests, ADRs, memory, ownership, and proof references before or
during implementation. Use `codedecay agent` or `codedecay ai` when you want the
full handoff bundle with fix tasks after analysis.

```bash
npx codedecay session start --session users-export --task "Add a GET /api/users export endpoint"
npx codedecay session context --session users-export --format markdown
npx codedecay session checkpoint --session users-export --kind diff --summary "Export route implemented"
npx codedecay session finish --session users-export --format markdown
npx codedecay ai preflight --task "Add a GET /api/users export endpoint" --format markdown
npx codedecay context --task "Add a GET /api/users export endpoint" --format markdown
npx codedecay ai --base main --head HEAD --format markdown
npx codedecay ai --profile claude-code --format markdown
npx codedecay ai --with-checks --base main --head HEAD --format markdown
npx codedecay agent --base main --head HEAD --format markdown
npx codedecay agent --profile codex --format markdown
npx codedecay agent preflight --task "Add a GET /api/users export endpoint" --format markdown
npx codedecay agent --cwd ../my-repo --format json --output codedecay-agent.json
```

`ai` does not call the selected coding agent. `--investigate` explicitly calls
only the configured local/BYOK provider, while `--with-checks` explicitly runs
configured commands and adapters through CodeDecay safety policy. The bundle
records whether either action occurred and includes verification evidence.

## Continuous Agent Sessions

Use `codedecay session` when an agent is going to work across multiple prompts
or tool calls. The lifecycle is:

1. `session start`: create the stable session with task requirements, base
   revision, preflight guidance, local memory, design constraints, and proof
   expectations. It does not require a git diff.
2. `session context`: refresh bounded task context from current repository
   evidence and write `.codedecay/local/task-context.json`. If files changed
   since the last session observation, CodeDecay marks the session stale and
   asks for a checkpoint.
3. `session checkpoint`: record a plan or diff checkpoint. Agent-authored
   summaries are redacted and stored as untrusted data.
4. `session finish`: record the current tree and return a verification boundary
   with allowed configured checks and acceptance criteria that still need proof.

Example:

```bash
npx codedecay session start \
  --session billing-retry \
  --task "Allow finance admins to retry failed payouts" \
  --requirements .codedecay/requirements.yml

npx codedecay session context --session billing-retry --format json --max-nodes 16
npx codedecay session checkpoint --session billing-retry --kind plan --summary "Plan is ready"
npx codedecay session checkpoint --session billing-retry --kind diff --summary "Retry route implemented"
npx codedecay session finish --session billing-retry --format markdown
```

Session operations do not call models, run configured commands, use network
access, send telemetry, install tools, commit, push, or silently overwrite an
existing session id. Run verification explicitly with `codedecay execute`,
`codedecay differential`, `codedecay ai --with-checks`, or your project test
commands after reviewing the finish boundary.

## Preflight Before Code Generation

Use `codedecay agent preflight` before a coding agent starts editing. It does
not require a git diff, run configured commands, call models, or send telemetry.

```bash
npx codedecay agent preflight \
  --task "Add a dashboard filter for reviewed uploads" \
  --requirements .codedecay/requirements.yml \
  --format markdown
```

The optional requirements artifact is repo-local JSON or YAML. It can provide
`acceptanceCriteria`, `currentBehavior`, `expectedBehavior`, `affectedFlows`,
`nonGoals`, `invariants`, `architectureConstraints`, and
`unresolvedQuestions`. CodeDecay records the artifact as provenance and keeps
requirement evidence separate from its own suggestions.

The preflight report separates requirement evidence, deterministic repo
evidence, and suggestions:

- likely impacted areas from the task description
- candidate files and route/API surfaces from repo paths
- matched local memory, invariants, architecture notes, and regressions
- matched design-contract boundaries
- configured checks listed as follow-up proof with `willRun=false`
- proof plan and non-goals for the receiving agent

Candidate files require domain-specific task terms or stronger repo evidence.
Generic words such as `api` alone do not make every API-related file a
candidate. When CodeDecay cannot ground the task in the repository, it returns
low confidence, no candidate files, and an unresolved question instead of
inventing scope.

Treat preflight as a before-coding brief. After the agent edits code, run
`codedecay ai --with-checks` to gather configured proof and produce the next
agent bundle.

## Explicit Agent Investigation

Add `--investigate` to preflight or post-diff agent bundles to call the
repo-configured local/BYOK provider:

```bash
npx codedecay agent preflight --investigate \
  --task "Add a billing export API" \
  --requirements .codedecay/requirements.yml

npx codedecay agent --investigate \
  --task "Review billing export regressions" \
  --requirements .codedecay/requirements.yml
```

CodeDecay sends structured requirements, deterministic impact and changed-path
proof, memory, skills, verification results, and limitations. Returned
candidate risks, affected flows, edge cases, proof proposals, unresolved
questions, and consequence hypotheses remain untrusted. Hypotheses must cite
stable evidence ids, name a user-visible consequence, include a disconfirming
result, and map to a verifier such as a configured check, OSS adapter,
product probe, differential check, static analyzer, or human decision. They
never raise deterministic risk or prove merge safety without corroborating
tool/runtime evidence. Without `--investigate`, no provider is selected or
called.

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
