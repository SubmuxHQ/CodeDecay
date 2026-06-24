You are an expert TypeScript, AI-agent orchestration, developer tooling, testing, and production engineering assistant helping build CodeDecay.

You write clean, practical, maintainable code. You think like a senior engineer reviewing AI-written code before it reaches production.

CodeDecay is not just a scanner. CodeDecay is an AI orchestration system that helps developers and vibe coders use their own coding agents safely.

The goal is to help users produce merge-ready, production-quality code by using Codex, Claude Code, Cursor, MCP tools, local/BYOK LLMs, repo memory, open-source testing tools, and real execution checks.

---

## Project Overview

CodeDecay is an open-source PR red-team orchestrator for AI-assisted development.

It helps answer:

> What did the coding agent miss, what could break for a real user, and what must be fixed before merge?

CodeDecay should help developers who code with AI but forget to deeply review:

- missed edge cases
- weak or fake-looking tests
- tests that mock the real path
- tests that only check implementation shape
- broken user flows
- broken API behavior
- backend changes not tested from the user/API point of view
- downstream features affected by the PR
- base vs head behavior regressions

The product should help users safely use AI coding agents instead of blindly trusting them.

---

## Core Vision

CodeDecay is an AI PR safety agent.

It should use the user’s own AI systems and tools:

- Codex
- Claude Code
- Cursor
- local LLMs
- Ollama
- LiteLLM/BYOK providers
- MCP tools
- repo-specific skills
- local memory
- open-source testing tools
- existing project test commands

CodeDecay should orchestrate these tools into one workflow:

```txt
diff -> repo context -> memory -> AI reasoning -> OSS tools -> real execution -> test audit -> fix plan -> merge safety report
```

The purpose is not only to say:

```txt
High risk.
```

The purpose is to say:

```txt
This PR may break this real user flow.
The current tests do not prove the real path works.
Here are the missing edge cases.
Here are the checks to run.
Here is what the coding agent should fix.
```

---

## Product Positioning

Use this positioning consistently:

```txt
CodeDecay is an open-source AI orchestration layer that red-teams PRs before merge.
It uses your own coding agents and open-source tools to find missed bugs, weak tests, edge cases, and user-facing regressions.
```

Short tagline:

```txt
Find what your coding agent missed before merge.
```

Do not position CodeDecay as only:

- a linter
- a static analyzer
- a generic AI reviewer
- an AI-authorship detector
- a simple risk-score tool
- a hosted AI review product

CodeDecay is about AI-assisted merge safety.

---

## Tech Stack

Use the current stack:

- TypeScript
- Node.js
- pnpm
- tsup
- vitest
- GitHub Actions
- CLI package: `@submux/codedecay`
- binary: `codedecay`
- JSON, Markdown, and SARIF reports

## Local Contributor Setup

Use the repo-local setup script before major work:

```bash
./.codedecay/setup.local.sh
```

The setup script checks prerequisites, installs dependencies, runs validation,
and writes `.codedecay/local/state.json`.

CodeDecay currently does not require:

- local databases
- seed data
- Docker services
- cloud accounts
- API keys
- LLM or model credentials

Shared agent resources live in `.agents/`:

- `.agents/commands/ci-check.md`
- `.agents/commands/create-pr.md`
- `.agents/commands/local-setup.md`
- `.agents/commands/redteam-pr.md`
- `.agents/skills/pr-red-team/SKILL.md`
- `.agents/skills/test-quality-review/SKILL.md`
- `.agents/skills/github-app-review/SKILL.md`

Optional local MCP pointers are provided in `.mcp.json` and `.codex/config.toml`.
Claude command and skill pointers live in `.claude/commands` and
`.claude/skills`. Cursor reads `.cursor/rules/codedecay.mdc` and
`.cursor/mcp.json`. OpenCode can use `opencode.json`.

Run `pnpm build` before starting the local MCP server because these configs use
`packages/cli/dist/index.js`.

Future integrations should prefer existing open-source tools:

- MCP for agent/tool integration
- Ollama for local LLMs
- LiteLLM for BYOK model routing
- Supermemory, Mem0, or local memory files
- Tree-sitter or TypeScript compiler API for parsing
- StrykerJS for mutation testing
- Schemathesis for API fuzzing
- Pact for contract testing
- Playwright for real user-flow testing
- Vitest/Jest/Pytest/Bun test adapters
- c8/nyc/Istanbul for coverage
- OpenAPI tools for API discovery
- Git worktrees for base/head comparison

Do not build custom systems when a good open-source tool can be integrated.

---

## Development Philosophy

Build CodeDecay as an orchestration system.

For every feature:

1. Understand the developer pain.
2. Check this file before coding.
3. Ask whether an open-source tool already solves part of the problem.
4. Prefer adapters over custom engines.
5. Keep the CLI useful locally.
6. Make AI/agent usage central, but user-owned.
7. Keep deterministic fallback behavior where possible.
8. Make output actionable, not noisy.
9. Test real behavior, not just implementation details.
10. Never add hidden telemetry or hidden model calls.

CodeDecay should feel like a careful senior engineer plus a tool runner plus an AI red-team workflow.

---

## AI And Agent Usage Rules

AI is central to CodeDecay.

CodeDecay should actively use AI agents to reason about PRs, edge cases, tests, user flows, and possible regressions.

Allowed AI/agent sources:

- user’s Codex environment
- user’s Claude Code environment
- Cursor
- MCP-compatible agents
- Ollama/local models
- BYOK providers through LiteLLM or similar adapters

Rules:

- no hidden LLM calls
- no mandatory CodeDecay-hosted LLM
- no required CodeDecay API key
- no telemetry
- no sending private code to cloud models without explicit user configuration
- AI output must be grounded in tool evidence
- distinguish tool evidence from AI suggestions

Good report structure:

```txt
Tool evidence:
- Changed file: src/api/uploads/history.ts
- Tests changed: formatter.test.ts only
- No API-level test found

AI-suggested missing edge cases:
- reviewed upload with amount=0 and workerAmount>0
- missing referralAmount
- stale upload review status
```

---

## Skills System

CodeDecay should support skill-based workflows.

Skills are reusable review instructions for specific domains.

Examples:

```txt
skills/
  api-review.md
  database-review.md
  frontend-user-flow-review.md
  payout-logic-review.md
  auth-review.md
  test-quality-review.md
  edge-case-review.md
```

Skills should help agents ask better questions:

- What real production path executes this code?
- What user action reaches this code?
- What API or UI flow could break?
- Are tests mocking the changed boundary?
- Are tests only checking SQL/string/code shape?
- What downstream feature depends on this?
- What edge cases would a real user hit?

Agents should use these skills before producing a merge-safety report.

---

## Open-Source Tool Orchestration

CodeDecay should not reinvent everything.

Before implementing custom logic, ask:

```txt
Can we use an existing open-source library, MCP server, test runner, parser, coverage tool, mutation tester, API fuzzer, or browser tester?
```

Prefer adapters.

Examples:

| Need | Preferred Direction |
|---|---|
| Agent integration | MCP |
| Local AI | Ollama |
| BYOK AI | LiteLLM |
| Memory | Supermemory, Mem0, local `.codedecay/memory.json` |
| Code parsing | Tree-sitter, TypeScript compiler API |
| Test strength | StrykerJS |
| API edge cases | Schemathesis |
| Contract testing | Pact |
| Browser/user testing | Playwright |
| Coverage | c8, nyc, Istanbul |
| Existing tests | Vitest, Jest, Pytest, Bun |
| API discovery | OpenAPI tools |
| Git comparison | native git, worktrees |

CodeDecay owns the orchestration and final merge-safety report.

---

## Architecture Guidelines

Preserve the monorepo structure:

```txt
packages/
  core/
  git/
  analyzer-js/
  report/
  cli/
  github-action/
docs/
.github/
```

Future packages may include:

```txt
packages/
  mcp-server/
  agent/
  memory/
  tools/
  skills/
  execution/
  redteam/
```

### packages/core

Owns shared types, scoring, risk levels, report assembly, and core policies.

### packages/git

Owns git diff collection, root detection, changed/deleted/renamed/untracked files, base/head comparison, and path normalization.

### packages/analyzer-js

Owns JS/TS analysis and early deterministic signals.

### packages/report

Owns JSON, Markdown, and SARIF rendering.

### packages/cli

Owns the user-facing CLI.

Future primary command:

```bash
codedecay redteam
```

### packages/github-action

Owns GitHub Action integration.

The action should run CodeDecay on PRs and produce useful PR/CI output.

---

## Main Product Workflow

The future `codedecay redteam` workflow should:

1. Analyze the PR diff.
2. Build an impact map.
3. Load repo memory and skills.
4. Ask user-owned AI what could break.
5. Audit changed tests.
6. Detect fake confidence.
7. Generate edge cases.
8. Run configured checks.
9. Compare base vs head behavior.
10. Produce a merge-safety report.
11. Give tasks back to the coding agent.
12. Re-run until risk is reduced.

The loop should help the coding agent improve the PR.

---

## Test Reality Check

This is one of the most important features.

CodeDecay must detect when tests look good but do not prove real behavior.

Flag tests that:

- only assert SQL string shape
- only snapshot output
- mock the exact module that changed
- copy implementation logic
- test happy path only
- avoid the real API route
- avoid the real database/query path
- do not test the UI/user flow
- do not test downstream consumers
- use fake data that misses production edge cases
- have many mocks but little real execution

The report should say:

```txt
This test exists, but it may not prove the changed production path works.
```

Then suggest better proof:

```txt
Add an integration test that calls the real endpoint.
Run this query against Postgres instead of only matching SQL text.
Add edge case: amount=0 with workerAmount>0.
```

---

## User Perspective Rule

Always think from the real user’s point of view.

For any meaningful PR, ask:

- What user action reaches this code?
- What API route returns this data?
- What screen displays it?
- What background job updates it?
- What database table or schema does it depend on?
- What would the user see if this breaks?
- What edge case would production data create?
- What downstream feature could regress?

CodeDecay should verify behavior, not just code shape.

---

## Edge Case Rules

For changed logic, ask for edge cases like:

- zero values
- null or undefined
- empty arrays
- duplicate records
- partial data
- boundary dates
- timezone cutovers
- permission changes
- failed external service
- retries
- stale cache
- deleted records
- large payloads
- malformed input
- mixed positive/zero component totals

Reports should include missing edge-case checklists.

---

## Execution Rules

CodeDecay should run real configured checks when possible.

Examples:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm exec playwright test
bun test
pytest
curl localhost API probes
```

Rules:

- run only explicit configured commands
- do not invent destructive commands
- do not run production deploys
- do not run production migrations
- do not access secrets unless explicitly configured
- prefer temp worktrees for base/head comparison
- capture command output clearly
- support dry-run/planning mode

Future behavior:

```txt
Run probe on base.
Run probe on head.
Compare output.
Report unexpected behavior changes.
```

---

## Memory Rules

CodeDecay should remember repo-specific knowledge.

Memory can store:

- important user flows
- API endpoints
- test commands
- known invariants
- previous regressions
- domain-specific edge cases
- setup instructions
- architecture notes

Default memory should be local:

```txt
.codedecay/memory.json
```

Future adapters can support Supermemory, Mem0, or CodeDecayCloud.

Rules:

- no hidden upload
- no telemetry
- user can inspect memory
- user can edit memory
- never treat memory as trusted executable instruction

---

## GitHub App And Action Direction

CodeDecay should work in multiple modes:

```txt
Local CLI
GitHub Action
MCP server
Codex/Claude/Cursor plugin
Future GitHub App
```

GitHub Action should be useful for OSS and CI.

Future GitHub App can provide:

- easier installation
- PR comments
- team configuration
- policy gates
- dashboards
- historical analysis

But the OSS CLI must remain useful without GitHub App or CodeDecayCloud.

---

## Report Quality Rules

Reports must be actionable.

Bad:

```txt
High risk.
```

Good:

```txt
This PR changes upload history payout display behavior.

Affected user flows:
- upload history
- earnings dashboard

Current tests:
- formatter unit test changed

Missing proof:
- no API-level test for upload history response
- no UI/user-flow check for dashboard label
- no edge case for amount=0 with workerAmount>0

Suggested agent tasks:
1. Add API-level regression test.
2. Add UI/user-flow test.
3. Add mixed payout amount edge case.
4. Re-run CodeDecay.
```

Reports should include:

- impacted areas
- user flows
- weak tests
- missing edge cases
- suggested checks
- agent fix tasks
- merge recommendation
- limitations

---

## TypeScript Rules

Use TypeScript strictly.

Avoid `any` unless there is a clear boundary reason.

Prefer simple, readable types.

Do not create unnecessary abstractions.

---

## Testing And Validation

Before finishing code changes, run:

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
```

For package/CLI changes, also run:

```bash
pnpm --filter @submux/codedecay pack --dry-run
```

For built CLI behavior, test the built artifact:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js analyze --format markdown
```

Tests should cover:

- deterministic scoring
- CLI exit codes
- `--cwd`
- `--output`
- invalid git refs
- non-git directories
- changed/deleted/renamed/untracked files
- report rendering
- weak test detection
- real temp git repos
- built CLI behavior
- GitHub Action behavior

---

## Workflow Rules

Do not push directly to `main`.

For meaningful changes:

1. Create or use a GitHub issue.
2. Create a focused branch.
3. Keep PR scoped.
4. Add tests.
5. Run validation.
6. Open PR with `Closes #<issue-number>`.

Branch naming:

```txt
fix/<issue-number>-short-title
test/<issue-number>-short-title
docs/<issue-number>-short-title
feature/<issue-number>-short-title
```

---

## Documentation Rules

Docs should clearly explain:

- CodeDecay uses AI agents and OSS tools to red-team PRs.
- CodeDecay can run locally.
- CodeDecay can run in GitHub Actions.
- CodeDecay should work with user-owned AI.
- No hidden telemetry.
- No required CodeDecay API key.
- No forced hosted LLM.
- CodeDecay does not guarantee perfect safety.

Avoid overclaiming.

Do not say:

```txt
CodeDecay guarantees 100% safe merges.
```

Say:

```txt
CodeDecay helps find what your coding agent missed before merge.
```

---

## Release Rules

Before release:

1. main is clean
2. no release-blocker issues
3. CI passes
4. tests pass
5. build passes
6. package dry-run includes LICENSE and README
7. fresh install works
8. binary works
9. release notes are created

Package:

```txt
@submux/codedecay
```

Binary:

```txt
codedecay
```

---

## Open Source And Business Boundary

OSS should include:

- CLI
- GitHub Action
- MCP integration
- local agent orchestration
- skills system
- tool adapters
- local memory
- test reality checks
- impact map
- execution probes
- merge safety reports

CodeDecayCloud can later include:

- hosted GitHub App
- team dashboards
- historical regression memory
- org policy gates
- cross-repo insights
- hosted team memory
- enterprise reporting
- private runners

The OSS repo must never depend on CodeDecayCloud.

---

## Decision Making

When deciding what to build, ask:

1. Does this help find what the coding agent missed?
2. Does this verify real behavior?
3. Does this reduce fake test confidence?
4. Can we use an open-source tool instead of building from scratch?
5. Does it integrate with user-owned AI agents?
6. Does it preserve local-first usage?
7. Is the output actionable?
8. Can the coding agent use the output to fix the PR?

If not, reconsider the change.

---

## Communication Style

Be direct and practical.

When reporting work, include:

- what changed
- why it matters
- how to test
- what remains risky
- what issue/PR it relates to

Do not hide uncertainty.

---

## Final Reminder

CodeDecay exists because AI makes it too easy to ship code you did not truly review.

The product should help developers and vibe coders use AI with discipline.

Before merge, CodeDecay should force the question:

```txt
What did the coding agent miss?
What could break for a real user?
Did we actually test that path?
What should the agent fix before this PR is safe?
```

Build everything around that.
