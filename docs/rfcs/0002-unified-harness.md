# RFC 0002: Unified Local-First Safety Harness

Status: proposed

Issue: #562

## Summary

CodeDecay should evolve from a PR regression-risk tool into a unified,
local-first code safety harness.

The harness should answer one question before a PR is merged:

```text
What could this PR break, is it secure, and do the tests actually prove it
will not?
```

The product direction is agent-first but not agent-dependent. CodeDecay should
produce deterministic evidence that any user-owned coding agent, desktop app,
MCP client, or local review workflow can consume. Optional AI investigation can
add suggestions, but the free baseline must stay useful without a model call.

Positioning:

```text
CodeDecay is an open-source PR red-team harness for AI-assisted development.

It maps impact, audits tests, checks security-sensitive code paths, runs
configured open-source tools, and packages evidence for the user's own agent.
```

This RFC studies Vercel Labs `deepsec` as a reference architecture. CodeDecay
should adapt the strongest ideas: staged pipelines, matcher registries,
per-file state, revalidation, enrichment, and plugin contracts. CodeDecay
should not copy an AI-required or cloud-gateway-required workflow.

## Product Invariants

The OSS repository must remain:

- local-first
- deterministic by default
- useful without telemetry
- useful without API keys
- useful without required LLM or model calls
- useful without CodeDecayCloud
- explicit about command execution
- clear about which evidence is trusted tool output versus untrusted AI
  suggestion

AI, external memory, and hosted services are optional adapters. They must never
be hidden prerequisites for `codedecay analyze` or deterministic
`codedecay redteam`.

## Current CodeDecay Map

Current package ownership already points in the right direction:

| Package | Current responsibility | Gap for unified harness |
| --- | --- | --- |
| `packages/core` | Shared report, findings, impact, scoring, product-failure types | Needs security dimension, candidate/finding distinction, and unified evidence provenance |
| `packages/git` | Changed files, refs, repo roots, untracked/deleted/renamed files, worktrees | Needs whole-repo audit file discovery integration |
| `packages/analyzer-js` | JS/TS deterministic impact, routes, risky areas, decay, weak-test signals, runtime coverage | Needs pluggable language/parser boundary and security matcher inputs |
| `packages/report` | JSON, Markdown, SARIF rendering | Needs unified report sections for security candidates, revalidation, enrichment, and audit state |
| `packages/cli` | User-facing commands including analyze, redteam, agent, execute, differential, mcp, product | Needs new audit/investigate/revalidate flows once RFC is implemented |
| `packages/redteam` | Deterministic merge-safety report assembly | Needs to become the stage orchestrator for unified evidence, not just a wrapper around analyze |
| `packages/harness` | Harness interface, evidence, registry, failure modes | Good foundation; needs broader plugin coordination and stage metadata |
| `packages/memory` | Local repo memory and learn/import helpers | Needs feedback loop from confirmed findings and regressions |
| `packages/llm` | Disabled/Ollama/LiteLLM provider abstraction | Good foundation; needs explicit investigate/revalidate prompt contracts and refusal handling |
| `packages/mcp` | Local MCP tools for analysis, execution, product checks | Needs tools for audit, investigate, revalidate, and evidence retrieval |
| `packages/execution` | Safe configured command execution | Good foundation; must stay the only execution path for adapters |
| `packages/test-audit` | Test-proof classification and weak/missing-test audit | Needs deeper integration with mutation, coverage, and real behavior evidence |
| `packages/tool-adapters` | Agent process, coverage, Pact, Playwright, Schemathesis, Semgrep, Stryker adapters | Good foundation; should be registered through a plugin architecture |
| `packages/config` | `.codedecay` config, safety, commands, LLM, adapters | Needs plugin config and audit storage config |
| `packages/agent` | Task bundles for user-owned agents | Needs to consume unified evidence and produce fix tasks without claiming proof |
| `packages/skills` | Local skill loading/summaries | Needs skill selection tied to impacted areas, security candidates, and weak tests |
| `packages/github-action` | Composite action wrapper | Should expose new deterministic safety harness modes as they land |
| `packages/github-app` | App server experiments | Should stay deterministic until sandboxing and permission design are ready |

The current deterministic scoring model has two scores: merge risk and decay
risk. It does not yet have an explicit security score or a structured
candidate/investigation/revalidation lifecycle.

## Reference Study: Deepsec

`deepsec` uses a staged architecture:

```text
scan -> process -> revalidate -> enrich -> export
```

Strong ideas worth adapting:

1. **Separate stages.** Free scanning is separated from expensive processing
   and from later revalidation/enrichment.
2. **Per-file state.** Each source file has a FileRecord containing candidates,
   findings, analysis history, git/ownership metadata, status, and lock state.
3. **Append-only history.** Re-running analysis appends history and merges new
   findings instead of destructively replacing old ones.
4. **Matcher registry.** Built-in and plugin matchers contribute candidate
   evidence. Matchers have slugs, descriptions, file patterns, noise tiers,
   optional gates, and examples.
5. **Plugin slots.** Matchers, agents, notifiers, ownership, people, executor,
   and commands are extension points.
6. **Atomic claims.** Long-running processing uses per-file locks so multiple
   workers do not clobber each other.
7. **Revalidation.** Existing findings can be classified as true-positive,
   false-positive, fixed, or uncertain.
8. **Enrichment.** Git history and ownership metadata can be attached after
   findings exist.
9. **Refusal and quota visibility.** Model refusals, skipped files, and quota
   failures are recorded rather than hidden.
10. **Direct file-list scans.** Diff-driven modes can write records for every
    listed file, including files with no matcher hit.

What CodeDecay should not copy:

1. **AI-required core.** CodeDecay's deterministic baseline must work without
   a model.
2. **Hosted gateway dependency.** No default hosted model or CodeDecayCloud
   dependency should be required.
3. **Candidate-as-gate behavior.** Matcher hits must not be the only files that
   get analyzed in PR diff mode. Every changed source file in scope must be
   represented, even when no matcher fires.
4. **AI output as proof.** AI suggestions must not raise deterministic scores by
   themselves.
5. **Silent skips.** Skipped files, capped files, refusals, unavailable tools,
   and denied commands must appear as missing evidence or explicit limitations.

## Target Architecture

```text
CLI / GitHub Action / MCP / future GitHub App
        |
        v
Unified safety harness
        |
        +--> git diff / file discovery
        +--> deterministic analyzers
        +--> security matchers
        +--> impact map
        +--> test audit
        +--> local memory
        +--> configured OSS tool adapters
        +--> optional user-owned agent or LLM investigation
        +--> optional revalidation
        +--> optional ownership/enrichment
        |
        v
One merge-safety report
        |
        +--> regression risk
        +--> maintainability decay
        +--> weak/missing test proof
        +--> security candidates/findings
        +--> evidence and limitations
        +--> tasks for the user's coding agent
```

All surfaces should use the same engine:

- CLI
- GitHub Action
- MCP server
- future GitHub App

## Unified Finding And Evidence Model

CodeDecay needs a model that can represent:

- deterministic regression findings
- deterministic decay findings
- deterministic weak-test findings
- deterministic security candidates
- tool findings from adapters
- optional AI suggestions
- revalidation verdicts
- enrichment data

Proposed concepts:

```ts
type SafetyDimension =
  | "regression"
  | "decay"
  | "test-proof"
  | "security";

type EvidenceTrust =
  | "deterministic"
  | "tool"
  | "memory"
  | "ai-suggestion"
  | "user";

type EvidenceConfidence =
  | "direct"
  | "heuristic"
  | "structural"
  | "unverified-suggestion";

type InvestigationStatus =
  | "candidate"
  | "confirmed"
  | "false-positive"
  | "fixed"
  | "accepted-risk"
  | "uncertain";
```

Rules:

- Security matcher hits start as deterministic candidates.
- Deterministic direct findings can affect scores immediately.
- Tool findings can affect scores when the tool produced structured evidence.
- Memory and AI suggestions are context, not proof.
- Optional AI investigation can propose confirmation, but final reports must
  show that verdict as untrusted unless paired with deterministic/tool evidence.
- Reports should show limitations and skipped files beside findings.

### Scores

Current scores:

- `mergeRiskScore`
- `decayScore`

Proposed addition:

- `securityScore`

The top-level risk level can remain a rollup, but the report should expose
separate breakdowns so a PR can be low regression risk and high security risk,
or high decay risk but low security risk.

Proposed score breakdowns:

- `mergeRiskBreakdown`
- `decayBreakdown`
- `testProofBreakdown`
- `securityBreakdown`

`testProofBreakdown` can start as report-only if adding a third/fourth score is
too disruptive for v1. The RFC phase should decide whether test proof is a
score or a supporting risk dimension.

## Security Matcher Layer

Add a future package:

```text
packages/matchers
```

Purpose:

- deterministic candidate generation for security-sensitive patterns
- framework entry-point coverage
- CWE-tagged rules
- plugin-contributed matchers
- reproducible examples and tests

Proposed public shape:

```ts
interface SecurityMatcher {
  ruleId: string;
  cwe?: string | undefined;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  confidence: "direct" | "heuristic" | "entry-point";
  languages: string[];
  filePatterns: string[];
  examples?: SecurityMatcherExample[] | undefined;
  match(context: SecurityMatcherContext): SecurityCandidate[];
}

interface SecurityCandidate {
  ruleId: string;
  cwe?: string | undefined;
  title: string;
  severity: "low" | "medium" | "high";
  file: string;
  line?: number | undefined;
  snippet?: string | undefined;
  evidence: string;
  confidence: "direct" | "heuristic" | "entry-point";
}
```

Initial matcher classes:

- SQL injection candidates
- command execution candidates
- path traversal candidates
- SSRF candidates
- unsafe HTML rendering candidates
- hardcoded secret candidates
- missing auth entry-point candidates
- insecure cookie/session config candidates
- unsafe deserialization candidates
- prototype pollution candidates

Important coverage rule:

```text
In PR diff mode, every changed source file in scope must be represented in the
analysis state. Matcher hits add evidence. Matcher misses must not remove the
file from analysis.
```

This avoids a candidate-gated false-negative path.

## Language And Parser Boundary

Current JS/TS analysis lives in `packages/analyzer-js`, with TypeScript/JS
specific parsing and route detection. The unified harness should add a
language/parser plugin boundary instead of hard-coding source extensions in one
package.

Proposed capabilities:

- classify language for a file
- parse symbols/routes/imports when supported
- normalize findings with line/snippet evidence
- report parser failures explicitly
- allow future Tree-sitter-backed parsing for non-JS languages

Initial implementation should keep JS/TS behavior intact and wrap it in a
pluggable interface before adding new languages.

## Two-Stage Pipeline

### Stage 1: deterministic analyze/redteam

Default, free, CI-safe.

Inputs:

- cwd
- base/head or working tree diff
- `.codedecay/config.*`
- `.codedecay/memory.json`
- optional existing audit data

Work:

- git diff and changed-file discovery
- path/AST impact mapping
- risky-area detection
- decay checks
- weak-test audit
- security matcher candidates
- configured check planning
- local memory matching
- report generation

No commands execute unless explicitly configured and invoked through execution
workflows. No model calls are made.

### Stage 2: optional investigate

Explicit opt-in only.

Inputs:

- deterministic evidence bundle
- changed source file content
- selected memory context
- selected skills
- provider config for a user-owned local/BYOK model or agent

Work:

- ask targeted questions about candidates, weak tests, and missing edge cases
- request suggested reproductions or fix tasks
- ask whether any file or issue was skipped/refused
- store suggestions separately from deterministic evidence

Rules:

- no default cloud call
- provider must be configured explicitly
- failures become explicit evidence limitations
- AI suggestions never mutate deterministic scores alone

## Optional On-Disk Audit State

Normal PR analysis should not require persistent state. Whole-repo audit and
incremental security review can use optional local state:

```text
.codedecay/data/<project>/
|-- project.json
|-- config.json
|-- memory-snapshot.json
|-- files/
|   `-- src/path/file.ts.json
|-- runs/
|   `-- 20260629-abc123.json
`-- reports/
    |-- latest.json
    `-- latest.md
```

The directory should be gitignored by default. It is local cache and audit
state, not required source code.

### Project Record

```ts
interface AuditProjectRecord {
  projectId: string;
  rootPath: string;
  createdAt: string;
  repoUrl?: string | undefined;
  defaultBranch?: string | undefined;
  configHash?: string | undefined;
}
```

### Run Record

```ts
interface AuditRunRecord {
  runId: string;
  projectId: string;
  rootPath: string;
  type: "analyze" | "scan" | "investigate" | "revalidate" | "enrich";
  scope: "pr-diff" | "whole-repo" | "file-list";
  base?: string | undefined;
  head?: string | undefined;
  createdAt: string;
  completedAt?: string | undefined;
  status: "running" | "done" | "error";
  stats: Record<string, number>;
}
```

### File Record

```ts
interface AuditFileRecord {
  filePath: string;
  projectId: string;
  language?: string | undefined;
  fileHash: string;
  status: "pending" | "processing" | "analyzed" | "error" | "skipped";
  lockedByRunId?: string | undefined;
  candidates: UnifiedCandidate[];
  findings: UnifiedFinding[];
  analysisHistory: AuditAnalysisEntry[];
  limitations: AuditLimitation[];
  lastScannedAt?: string | undefined;
  lastScannedRunId?: string | undefined;
}
```

Rules:

- writes are append-only where possible
- re-runs are idempotent for unchanged files
- changed files are re-analyzed by content hash
- locks prevent clobbering concurrent runs
- skipped/capped files are recorded with reasons
- no state is required for normal PR diff mode

## Revalidation

Revalidation should work in two layers.

### Deterministic revalidation

Examples:

- candidate file no longer exists
- matching snippet no longer exists
- line range changed and matcher no longer fires
- configured tool now passes
- coverage artifact now includes the changed source lines
- weak-test pattern was removed
- missing nearby tests now exist

### Optional AI revalidation

Examples:

- confirm whether an entry-point candidate is actually unauthenticated
- judge whether a test covers the real behavior path
- explain whether a fix likely addresses a regression

AI revalidation must be rendered as an untrusted suggestion unless paired with
deterministic or tool evidence.

Verdicts:

- `confirmed`
- `false-positive`
- `fixed`
- `accepted-risk`
- `uncertain`

## Memory Flywheel

Current local memory is a good base. The unified harness should learn from
confirmed evidence, not from arbitrary agent output.

Memory may store:

- important flows
- test commands
- invariants
- past regressions
- security-sensitive routes
- architecture notes
- known weak-test patterns
- required behavior probes

Loop-back rules:

- confirmed findings can become past-regression memory
- accepted risks can become review context
- user edits always win
- AI-generated memory suggestions require explicit review/apply
- memory is never executable authority

Default provider:

```text
.codedecay/memory.json
```

Future optional providers:

- Supermemory
- Mem0
- CodeDecayCloud

## Plugin Architecture

CodeDecay should generalize current tool adapter configuration into a plugin
registry. Plugins should be local JavaScript/TypeScript modules or package
exports, loaded only from explicit config.

Proposed extension points:

| Slot | Purpose | Merge behavior |
| --- | --- | --- |
| `matchers` | Deterministic security and impact candidates | additive, same id override must be explicit |
| `languages` | File classification and parser support | additive |
| `analyzers` | Deterministic repo/domain analyzers | additive |
| `agentProviders` | Optional user-owned agent or model providers | additive |
| `toolAdapters` | OSS tool harnesses | additive |
| `memoryProviders` | Local or external memory providers | explicit, local default |
| `ownership` | File/team/person ownership | single selected provider |
| `notifiers` | PR comments, issue creation, webhooks | additive, disabled by default |

Example config shape:

```ts
export default {
  plugins: [
    localSecurityPlugin(),
    nextjsPlugin(),
    codeownersPlugin()
  ],
  safety: {
    allowCommands: false,
    commandTimeoutMs: 120000
  }
};
```

Safety:

- plugins cannot execute commands directly
- command execution must go through `packages/execution`
- plugins cannot call models unless registered as explicit agent providers and
  selected by the user
- plugin failures are report limitations, not silent skips

## Ownership, Enrichment, And Triage

Enrichment should start deterministic:

- git blame or recent committers
- CODEOWNERS mapping
- package/workspace ownership if configured

Future optional enrichment:

- organization people directory
- team ownership service
- notifier routing

Triage should combine:

- severity
- confidence
- blast radius
- impacted routes/user flows
- security dimension
- weak/missing test proof
- ownership
- whether behavior changed between base/head

Triage should not hide lower-severity findings. It should prioritize review.

## Report Shape

One report should include:

1. Executive summary
2. Merge risk score
3. Decay score
4. Security score or security section
5. Test-proof status
6. Impacted areas and routes
7. Findings grouped by dimension and severity
8. Security candidates and confidence
9. Weak/missing tests
10. Tool evidence
11. Optional AI suggestions
12. Revalidation verdicts
13. Ownership/enrichment
14. Limitations and skipped files
15. Fix tasks for the user's coding agent

The report must keep this wall:

```text
Deterministic/tool evidence != AI suggestion
```

## CLI Shape

Existing commands should remain stable.

Potential future commands:

```bash
codedecay audit --scope pr
codedecay audit --scope repo
codedecay investigate --input .codedecay/data/<project>/runs/<run>.json
codedecay revalidate --input .codedecay/data/<project>/reports/latest.json
codedecay enrich --ownership codeowners
```

Do not add these commands before implementation issues are created.

## Benchmark Plan

Add a reproducible fixture repo with planted issues:

- SQL injection
- hardcoded secret
- missing auth
- path traversal
- SSRF
- command injection
- unsafe HTML rendering
- weak/fake tests
- missing real API test
- high-complexity change
- duplicate logic
- config/database regression

Benchmark modes:

| Mode | Expected result |
| --- | --- |
| deterministic diff | detects all changed-file regression/decay/test/security candidates with no keys and no model calls |
| deterministic whole-repo | records every source file, candidates, skips, and limitations |
| optional investigate | produces untrusted suggestions and records refusals/failures |
| revalidate | marks fixed/false-positive/uncertain without hiding prior history |
| incremental rerun | re-analyzes only changed files by hash |

Benchmark report should include:

- candidate recall
- confirmed finding precision after revalidation
- skipped/capped files
- duration
- cost, always `$0` for deterministic mode
- model/provider cost only for explicit optional investigate mode

## Phased Implementation Plan

### Phase 1: Matcher registry and security dimension

Issue:

```text
feat(matchers): add deterministic security matcher registry
```

Scope:

- add `packages/matchers`
- add security candidate type
- add matcher registry and tests
- add a minimal set of JS/TS security candidates
- render security candidates in reports
- do not call models

Acceptance:

- changed source files are represented even with zero matcher hits
- no silent skipped files
- deterministic scores remain stable
- CodeQL/security regex findings do not reintroduce unsafe regex patterns

### Phase 2: Pluggable language support

Issue:

```text
feat(language): add pluggable language and parser boundary
```

Scope:

- wrap existing JS/TS analyzer behind language interface
- keep current JS/TS behavior unchanged
- allow future Tree-sitter or compiler API plugins

Acceptance:

- current analyzer tests still pass
- unsupported files produce limitations, not crashes

### Phase 3: Candidate-driven investigate

Issue:

```text
feat(investigate): add optional grounded investigation stage
```

Scope:

- explicit command or flag only
- uses existing `packages/llm` provider boundary
- uses local memory and skills
- records suggestions separately
- records provider failure/refusal

Acceptance:

- disabled provider remains default
- deterministic report unchanged when investigate is not used
- AI suggestions cannot raise deterministic score alone

### Phase 4: Resumable data model and whole-repo audit

Issue:

```text
feat(audit): add resumable local audit data model
```

Scope:

- `.codedecay/data/<project>/`
- project/run/file records
- content hash
- append-only history
- safe lock metadata
- whole-repo audit mode

Acceptance:

- normal PR mode does not require persistent state
- rerun skips unchanged files
- all skipped/capped files are recorded

### Phase 5: Revalidate and memory loop-back

Issue:

```text
feat(revalidate): add deterministic revalidation and memory learning
```

Scope:

- deterministic revalidation checks first
- optional AI verdict second
- user-reviewed memory updates

Acceptance:

- fixed findings stay in history
- memory updates require explicit apply
- report shows true-positive/false-positive/fixed/uncertain state

### Phase 6: Plugin registry generalization and enrichment

Issue:

```text
feat(plugins): add CodeDecay plugin registry
```

Scope:

- plugin config loading
- matchers/languages/analyzers/agent providers/tool adapters/memory/ownership/notifiers
- CODEOWNERS enrichment first

Acceptance:

- plugins are explicit
- plugin failures are visible
- adapters still execute only through `packages/execution`

### Phase 7: Benchmark fixture and reproducible evaluation

Issue:

```text
test(benchmark): add unified harness planted-issue corpus
```

Scope:

- fixture repo or fixture workspace
- planted vulnerability/regression/weak-test cases
- deterministic run script
- output report

Acceptance:

- deterministic mode has no API/model calls
- benchmark records recall/limitations/duration
- CI can run the deterministic benchmark

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Regex matchers create false positives | mark candidates separately from confirmed findings, use severity/confidence, add examples |
| Matcher coverage creates false negatives | never gate changed-file analysis on matcher hits |
| Optional AI makes product look cloud-required | disabled provider remains default, docs show no-key path first |
| Plugin API becomes too broad too early | start with matchers and language boundary, then expand |
| Whole-repo audit state becomes confusing | keep it optional and local under `.codedecay/data/` |
| Tool adapters run unsafe commands | only `packages/execution` can execute configured commands |
| Memory pollutes future analysis | memory is untrusted context and user-reviewable |

## Open Questions

1. Should `securityScore` be a first-class top-level score in the first matcher
   phase, or should security start as a report section with high-severity
   findings?
2. Should `.codedecay/data/` live under `.codedecay/local/data/` to make the
   local-cache nature clearer?
3. Should plugin loading use ESM config only, or support JSON-declared package
   names first?
4. What should be the first non-JS language target after the interface exists?
5. Should optional investigate be a separate command or an explicit
   `redteam --investigate` mode?

## Validation For This RFC

This RFC PR should be docs-only.

Required validation:

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
```

No feature code should be added until this RFC is reviewed and follow-up
implementation issues are created.
