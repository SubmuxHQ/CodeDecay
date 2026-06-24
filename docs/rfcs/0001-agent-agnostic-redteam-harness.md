# RFC 0001: Agent-Agnostic Redteam Harness Architecture

Status: proposed

## Summary

CodeDecay should evolve from deterministic PR risk analysis into an
agent-agnostic PR safety harness for AI-assisted development.

CodeDecay should not replace Codex, Claude Code, Cursor, Pi, OpenCode, desktop
agents, or internal company agents. It should give those agents better evidence,
skills, memory, execution results, weak-test findings, and merge-safety reports.

Positioning:

```text
CodeDecay is an open-source PR safety harness that works with your existing AI
agents and open-source tools.

Use Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or any
MCP-compatible workflow. CodeDecay orchestrates evidence, memory, skills, test
audits, and runtime checks so your agent can find what it missed before merge.
```

Core question:

```text
What could this PR break, and are the tests actually proving it will not?
```

## Product Boundaries

CodeDecay owns:

- PR orchestration
- normalized evidence
- safety policy
- impact mapping
- test-quality audit
- tool-adapter coordination
- merge-safety reporting
- fix-task generation for coding agents

CodeDecay does not own:

- the user's main coding agent
- hosted model inference
- mandatory cloud memory
- every test runner or fuzzing engine
- every language parser

The default OSS experience must remain:

- local-first
- deterministic baseline
- no telemetry
- no required API keys
- no required LLM/model calls
- no required CodeDecayCloud

## Architecture

```text
User agent / IDE / harness
  Codex | Claude Code | Cursor | Pi | OpenCode | Desktop app | Custom MCP client
        |
        v
CodeDecay CLI / MCP / GitHub Action / GitHub App
        |
        v
redteam orchestrator
        |
        +--> git diff and current deterministic analyzer
        +--> impact map
        +--> memory providers
        +--> skill selection
        +--> agent/harness adapters
        +--> safe execution
        +--> OSS tool adapters
        +--> test audit
        +--> base/head differential checks
        |
        v
merge-safety report + evidence bundle + fix tasks
        |
        v
back to the user's agent for implementation
```

## `codedecay redteam` Flow

1. Analyze the PR diff with the existing deterministic engine.
2. Build an impact map for routes, APIs, UI flows, jobs, database/schema, auth,
   and config.
3. Load repo memory from `.codedecay/memory.json` and optional user-owned memory
   providers.
4. Select relevant review skills.
5. Ask an optional user-owned agent or harness for missed risks and edge cases.
6. Run selected open-source tools through safe adapters.
7. Audit changed and nearby tests for weak or fake confidence.
8. Generate an edge-case checklist grounded in impacted areas.
9. Compare base/head behavior through configured probes when explicitly enabled.
10. Produce a merge-safety report that separates tool evidence from AI
    suggestions.
11. Generate fix tasks for Codex, Claude Code, Cursor, Pi, OpenCode, or any
    MCP-compatible agent.

## Module Plan

### `packages/redteam`

Purpose: owns the end-to-end `codedecay redteam` orchestration.

Inputs:

- cwd
- base/head refs
- CodeDecay config
- selected adapters
- optional agent/harness provider

Outputs:

- merge-safety report
- normalized evidence bundle
- fix tasks

Public API:

```ts
interface RedteamInput {
  cwd: string;
  base?: string;
  head?: string;
  mode: "deterministic" | "assisted";
}

interface RedteamResult {
  report: MergeSafetyReport;
  evidence: Evidence[];
  fixTasks: FixTask[];
}
```

Safety:

- deterministic mode must work without agents or models
- no command execution unless explicitly configured

MVP:

- compose existing analyze, memory, config, and Markdown report data into a
  redteam-shaped report

### `packages/harness`

Purpose: registry and interface for agent and tool harnesses.

Inputs:

- redteam task
- repo context
- selected skills
- evidence collected so far

Outputs:

- harness plan
- harness run result
- normalized evidence
- summary

Public API:

```ts
interface CodeDecayHarness {
  name: string;
  capabilities: HarnessCapability[];
  requiredConfig: ConfigRequirement[];

  plan(input: HarnessPlanInput): Promise<HarnessPlan>;
  run(plan: HarnessPlan, context: HarnessRunContext): Promise<HarnessRunResult>;
  collectEvidence(result: HarnessRunResult): Promise<Evidence[]>;
  summarize(evidence: Evidence[]): Promise<HarnessSummary>;
}
```

Safety:

- adapters must declare whether they can execute commands, call models, or use
  network access
- all failures become structured failure modes

MVP:

- generic process harness adapter
- in-memory registry
- evidence schema

### `packages/agent`

Purpose: optional user-owned AI provider interface.

Inputs:

- prompt/task
- selected skills
- evidence bundle
- model/provider config

Outputs:

- AI suggestions
- missing edge cases
- fix tasks

Public API:

```ts
interface AgentProvider {
  name: string;
  availability(): Promise<ProviderAvailability>;
  complete(input: AgentCompletionInput): Promise<AgentCompletionResult>;
}
```

Safety:

- provider is disabled by default
- no hidden model calls
- cloud providers require explicit user config
- AI output is suggestions, never proof

OSS integrations:

- Ollama local models
- LiteLLM/OpenAI-compatible BYOK endpoints
- Codex/Claude/Pi/OpenCode via prompt/task adapters where possible

MVP:

- disabled provider
- OpenAI-compatible provider shape for later Ollama/LiteLLM support

### `packages/mcp`

Purpose: expose CodeDecay as tools to MCP-compatible agents.

Inputs:

- MCP tool calls
- cwd/base/head/options

Outputs:

- redteam plans
- analyze results
- impact maps
- test audit findings
- memory context
- evidence summaries

Safety:

- tool descriptions must say when commands may execute
- command-running tools require explicit config

MVP:

- extend the current MCP package instead of creating a parallel server package
- expose `redteam_plan`, `redteam_run`, `impact_map`, and `test_audit`

### `packages/skills`

Purpose: portable review instructions for agents and harnesses.

Inputs:

- impacted areas
- project language/framework
- user-selected skill pack

Outputs:

- selected skills
- prompts/checklists
- fix-task templates

Safety:

- skills are instructions, not executable authority
- skills cannot override command safety

MVP:

- filesystem skill loader for `.agents/skills`
- built-in skills for API, auth, database, frontend flow, test quality, and
  GitHub App review

### `packages/memory`

Purpose: project-specific context provider.

Inputs:

- local `.codedecay/memory.json`
- optional external memory config
- changed files and impacted areas

Outputs:

- relevant flows
- invariants
- past regressions
- architecture notes
- recommended checks

Safety:

- memory is untrusted context
- local file remains default
- external providers must be opt-in

OSS integrations:

- local `.codedecay/memory.json`
- Mem0
- Supermemory

MVP:

- formalize provider interface around the existing local memory package

### `packages/execution`

Purpose: safe command and probe execution.

Inputs:

- explicit configured command
- cwd/temp worktree
- timeout
- redaction rules

Outputs:

- stdout/stderr
- exit code
- duration
- structured failure mode

Safety:

- no guessed commands
- no destructive commands
- no production deploys
- no migrations
- no secret printing
- timeout required

MVP:

- extract and harden the current configured command runner

### `packages/test-audit`

Purpose: detect tests that look reassuring but do not prove real behavior.

Inputs:

- changed tests
- nearby tests
- changed source files
- optional coverage/mutation evidence

Outputs:

- weak-test findings
- missing-test recommendations
- evidence explaining why confidence is weak

Safety:

- static audit is allowed by default
- dynamic test execution requires explicit config

MVP:

- no assertions
- snapshot-only
- excessive mocks
- tests unrelated to changed source
- copied implementation logic heuristics

### `packages/impact-map`

Purpose: map PR changes to product/system areas.

Inputs:

- changed files
- AST/code map
- config/memory

Outputs:

- impacted routes
- API endpoints
- UI flows
- jobs
- database/schema areas
- auth/config boundaries

Safety:

- static mapping only by default
- no code execution

OSS integrations:

- TypeScript compiler API for JS/TS first
- Tree-sitter later for multi-language parsing

MVP:

- framework-aware JS/TS route/API/config map

### `packages/tool-adapters`

Purpose: normalize OSS tool execution and output.

Inputs:

- tool config
- cwd/base/head
- selected impacted areas

Outputs:

- evidence records
- artifact paths
- failure modes

Safety:

- adapters must use `packages/execution`
- adapters cannot bypass command allowlists

OSS integrations:

- Playwright
- StrykerJS
- Schemathesis
- Pact
- Vitest/Jest/Pytest/Bun
- c8/nyc/Istanbul

MVP:

- adapter interface
- Playwright adapter plan
- StrykerJS adapter plan
- Schemathesis adapter plan

## Evidence Model

Evidence should be the common currency between deterministic analysis, tools,
agents, and reports.

```ts
interface Evidence {
  id: string;
  source: EvidenceSource;
  kind:
    | "diff"
    | "impact"
    | "test"
    | "coverage"
    | "mutation"
    | "api-fuzz"
    | "contract"
    | "browser-flow"
    | "memory"
    | "agent-suggestion"
    | "execution";
  severity: "info" | "low" | "medium" | "high";
  summary: string;
  file?: string;
  line?: number;
  command?: string;
  artifactPath?: string;
  trusted: boolean;
}
```

Rules:

- tool evidence and AI suggestions must be rendered separately
- memory and agent output are untrusted by default
- evidence should reference files/lines/artifacts when available

## Harness Failure Modes

```ts
type HarnessFailureMode =
  | "missing-tool"
  | "missing-config"
  | "command-denied"
  | "timeout"
  | "nonzero-exit"
  | "network-required"
  | "unsafe-command"
  | "model-unavailable"
  | "no-evidence";
```

Failures should not disappear into generic logs. They should be visible in the
merge-safety report as missing evidence or blocked checks.

## OSS Integration Sequence

1. MCP server tools for any compatible agent.
2. Generic process harness for local commands and CLI-based agents.
3. Portable CodeDecay skills for Codex, Claude Code, Cursor, Pi, OpenCode, and
   internal agents.
4. Local memory provider, then optional Mem0/Supermemory providers.
5. Ollama and LiteLLM/OpenAI-compatible provider interfaces.
6. Playwright adapter for browser/user-flow evidence.
7. StrykerJS adapter for mutation-testing evidence.
8. Schemathesis adapter for API fuzzing evidence.
9. Pact adapter for contract-testing evidence.
10. Coverage adapters for c8/nyc/Istanbul.
11. TypeScript compiler API impact map, then Tree-sitter for multi-language.

## Implementation Issues

1. `docs(rfc): define agent-agnostic redteam harness architecture`
2. `feat(harness): add harness registry and evidence schema`
3. `feat(execution): add safe command runner`
4. `feat(mcp): expose redteam tools for MCP-compatible agents`
5. `feat(skills): add portable redteam skill loader`
6. `feat(memory): formalize local memory provider interface`
7. `feat(test-audit): detect weak and fake-looking tests`
8. `feat(tool-adapter): add Playwright harness`
9. `feat(tool-adapter): add StrykerJS harness`
10. `feat(tool-adapter): add Schemathesis harness`
11. `feat(agent): add optional Ollama provider`
12. `feat(agent): add optional LiteLLM provider`
13. `feat(harness): add Pi convenience adapter`

## First Three PRs

1. RFC PR: this document only.
2. Harness PR: add `packages/harness` with registry, evidence schema, and tests.
3. Execution PR: extract/harden safe configured command runner.

## Open Questions

- Should `codedecay redteam` default to deterministic-only mode and require
  `--assist` for any agent/model call?
- Should external memory providers live behind one provider interface or
  separate adapter packages?
- Should GitHub App redteam execution remain disabled until sandboxed workers
  exist?
- Should adapter artifacts be stored only in `.codedecay/artifacts/` or in a
  user-specified output directory?
- Which first external agent workflow should get convenience docs: Codex,
  Claude Code, Cursor, Pi, or OpenCode?
