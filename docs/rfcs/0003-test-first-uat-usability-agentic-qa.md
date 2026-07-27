# RFC 0003: Test-First UAT, Usability, and Agentic QA

Status: active implementation gate for issues
[#662](https://github.com/SubmuxHQ/CodeDecay/issues/662) through
[#669](https://github.com/SubmuxHQ/CodeDecay/issues/669) and future meaningful
behavior changes

## Summary

CodeDecay changes should be planned and tested from the user's point of view
before production code is written.

Every meaningful implementation issue must define four kinds of evidence:

1. deterministic contract and integration tests,
2. user acceptance testing (UAT),
3. usability testing,
4. agentic QA through a closed fix-and-reverify loop.

These layers answer different questions:

| Layer | Question |
|---|---|
| Contract/integration | Does the implementation obey its technical contract? |
| UAT | Can a representative user complete the intended job and observe the expected behavior? |
| Usability | Can that user or coding agent understand the workflow and act correctly without hidden knowledge? |
| Agentic closed-loop QA | Can an independent agent find a planted problem, repair it, and have the current tree reverified by trusted evidence? |

A unit test is not UAT. Agent text is not proof. A successful agent edit is not
complete until the edited tree is analyzed and checked again.

## Product Principle

The testing model must reinforce CodeDecay's positioning:

> Find what your coding agent missed before merge.

The product must prove that it can:

- understand the requested outcome,
- map the outcome to real repository and product behavior,
- distinguish trusted evidence from memory and AI suggestions,
- find weak proof and relevant edge cases,
- give a coding agent an actionable repair task,
- re-run real checks after the repair,
- explain what remains unverified.

## Required Pre-Code Test Contract

No implementation should begin until its issue contains a reviewed test
contract with:

- stable requirement and scenario IDs,
- actor and user job,
- preconditions and fixtures,
- expected behavior and observable failure,
- clean decoys and negative cases,
- evidence oracle for deciding pass or fail,
- UAT scenarios,
- usability tasks and measures,
- agentic closed-loop scenarios,
- safety and privacy constraints,
- commands and expected artifacts,
- explicit exit criteria and known limitations.

The contract is written before production implementation. Failing behavior may
be demonstrated on the base revision or on the feature branch, but intentionally
failing tests must not be merged into `main`.

## Test-First Lifecycle

### 1. Definition of ready

Before coding:

- acceptance criteria are concrete and numbered,
- the real user/API/job/data flow is named,
- current behavior is reproduced,
- expected behavior is observable,
- test fixtures and decoys are identified,
- the strongest available proof type is selected,
- the UAT, usability, and agentic QA contracts are reviewed.

### 2. Baseline and red evidence

Capture evidence that the current implementation does not satisfy the contract:

- a focused failing test,
- a seeded temporary repository,
- a base/head behavior difference,
- a built CLI failure,
- a stale or misleading report,
- or a benchmark miss/false positive.

The baseline belongs in the issue or PR evidence. Do not weaken the assertion to
make the baseline pass.

### 3. Small implementation slice

Implement the smallest slice that satisfies the contract. Prefer adapters to
custom engines when a maintained open-source tool already owns the analysis,
execution, or test boundary.

### 4. Deterministic verification

Run focused tests first, followed by the repository gates:

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm eval:pr-safety -- --run-id <issue>-pr-safety
pnpm build
pnpm --filter @submuxhq/codedecay pack --dry-run
```

Use `pnpm eval:benchmark` when scoring, rules, impact, ranking, or false-positive
behavior changes.

### 5. UAT on the built artifact

UAT must exercise the public behavior a user receives:

- packed or built CLI rather than source-only imports,
- isolated temporary git repositories,
- GitHub Action shell/runtime behavior where relevant,
- MCP request/response behavior where relevant,
- product/API/browser probes where relevant,
- both successful and blocked/failing states.

Every critical acceptance scenario must pass. A skipped critical scenario blocks
completion unless the issue explicitly records why a human decision is needed.

### 6. Usability evaluation

Run a task-based session with a participant who did not implement the change.
For an early PR, this may be a fresh-context maintainer or independent QA agent;
before a release milestone, repeat the important workflow with at least three
representative human developers. Agent evaluation supplements rather than
replaces human usability testing.

Record:

- task completion,
- incorrect or unsafe actions,
- time or number of attempts,
- clarification requests,
- whether evidence and limitations were interpreted correctly,
- confusing labels, ordering, or remediation text,
- participant role and environment.

Per-PR usability gates:

- the primary task completes without implementation knowledge,
- no participant mistakes AI suggestion or memory for trusted proof,
- no participant mistakes `unverified` or `needs-human` for merge-safe,
- the next action and rerun command are discoverable,
- critical safety choices are explicit.

### 7. Agentic QA closed loop

Use separate roles:

- **Builder agent:** may implement the requested change.
- **QA agent:** receives the requirement, built artifact, repository state, and
  allowed commands, but not the builder's private reasoning or proposed answer.

The QA agent attempts to disprove completion:

```text
requirements
-> built CLI / public workflow
-> deterministic evidence
-> independent QA investigation
-> repair task
-> builder edit
-> changed-tree analysis
-> configured checks and product probes
-> final requirement status
```

CI uses a deterministic fake agent so the suite is reproducible and free of
hidden model calls. Optional real-agent evaluations must use an explicit
user-owned provider and record provider/model/configuration, cost boundary, and
nondeterministic limitations.

Every closed-loop fixture needs:

- one planted defect the workflow should find,
- one clean decoy it must not flag,
- one weak or missing proof condition,
- one agent repair,
- one final revalidation of the edited tree,
- one failure or unsafe-command path,
- proof that agent output alone cannot establish safety.

### 8. Completion evidence

An issue can close only when:

- focused and repository-wide deterministic checks pass,
- every critical UAT scenario passes,
- usability gates pass or remaining friction is explicitly accepted,
- closed-loop QA revalidates the final edited tree,
- clean decoys remain clean,
- limitations and unavailable tools are visible,
- the PR links the pre-code contract and evidence.

## Evidence Rules

Use this trust order:

1. real execution and product behavior,
2. configured OSS tool output,
3. deterministic repository analysis,
4. requirement and architecture context,
5. memory context,
6. AI or agent suggestions.

Lower-trust context can guide investigation but cannot silently become
higher-trust proof.

Avoid weak evidence such as:

- source-string presence as the only runtime assertion,
- snapshots with no semantic assertions,
- mocks of the exact changed boundary,
- tests that copy the implementation,
- happy-path-only fixtures,
- a score decrease with no behavior oracle,
- an agent saying the task is complete,
- a report generated before the final agent edit.

## Common Fixture Design

Each fixture should include:

- a minimal real repository with git history,
- base and changed behavior,
- the affected public route/command/job,
- representative data boundaries,
- relevant tests and deliberately weak tests,
- unrelated files whose names contain tempting keywords,
- explicit expected findings and non-findings,
- deterministic cleanup.

Prefer shared fixture builders only when they preserve readable issue-specific
behavior. Do not hide the user story behind an abstract test factory.

## Issue Test Contracts

### #662: Untrusted memory must not score as merge-risk proof

**User job:** use repository memory to guide review without letting editable
context decide whether a PR is safe.

**UAT**

- `UAT-662-1`: Run the built CLI on the same diff with no memory, benign memory,
  and alarming/malicious memory. Deterministic risk, findings, and loop safety
  gates remain identical when no trusted evidence changes.
- `UAT-662-2`: Confirm relevant memory still appears as labeled context,
  suggested checks, and agent guidance.
- `UAT-662-3`: Add real runtime/tool evidence matching a remembered regression.
  Risk changes because of that evidence source, not because memory was present.
- `UAT-662-4`: Put command-like instructions in memory and prove CodeDecay does
  not execute them.

**Usability**

- A fresh participant can identify which items are memory context and which are
  trusted findings.
- The participant does not interpret a memory-only warning as a merge blocker.
- Score breakdown and remediation text explain how memory can be corroborated.

**Agentic closed-loop QA**

- Clean diff plus alarming memory: QA agent may investigate, but the loop must
  not request an unnecessary code repair or claim trusted risk.
- Real defect plus benign memory: the builder fixes the defect; final score and
  verdict change only after post-edit deterministic evidence.
- A fake agent claiming “verified” without a code/test change cannot produce a
  merge-safe verdict.

**Automation target:** paired core scoring, memory, redteam, report, and loop
fixtures. The same normalized report is compared with memory enabled/disabled.

### #663: Structured requirements and acceptance criteria

**User job:** give CodeDecay a product requirement once and have that context
survive preflight, analysis, agent handoff, and verification.

**UAT**

- `UAT-663-1`: Supply task text plus a local Markdown/JSON acceptance artifact;
  the built CLI preserves IDs, behavior, non-goals, provenance, flows, and proof
  needs in JSON and Markdown.
- `UAT-663-2`: In a billing fixture containing unrelated API-tooling decoys,
  billing implementation candidates rank first for evidence-backed reasons.
- `UAT-663-3`: A task with no repository evidence returns insufficient context
  and unresolved questions instead of invented candidate files.
- `UAT-663-4`: Contradictory sources remain visible with provenance and require
  resolution; they are not silently merged.
- `UAT-663-5`: CLI, MCP, redteam, and agent bundle carry the same stable
  requirement IDs.

**Usability**

- A developer can create valid requirement input from the documented example in
  one attempt.
- Validation errors identify the exact field and a safe correction.
- A fresh participant can distinguish requirement evidence, inferred context,
  and agent suggestions.

**Agentic closed-loop QA**

- QA agent receives a requirement fixture and identifies the real billing path
  while ignoring keyword decoys.
- Builder makes a requirement-aligned edit and adds proof; revalidation retains
  IDs and updates evidence.
- Missing acceptance criteria force an explicit question/insufficient-context
  state instead of autonomous scope invention.

**Automation target:** schema/type tests, parser tests, built CLI fixtures, MCP
contract tests, redteam/agent round trips, and malformed-input cases.

### #664: First-class user-owned AI investigation

**User job:** explicitly invoke the user's own agent to investigate grounded
evidence without hidden calls or untrusted conclusions becoming proof.

**UAT**

- `UAT-664-1`: With no provider/agent intent, the workflow stays deterministic
  and reports that no model was called.
- `UAT-664-2`: With an explicit fake user-owned agent, the request includes
  requirements, impact, proof, memory, skills, checks, and limitations.
- `UAT-664-3`: Structured risks, flows, edge cases, proof proposals, and
  unresolved questions round-trip through CLI and MCP.
- `UAT-664-4`: malformed, timed-out, failed, and adversarial agent responses
  degrade cleanly to deterministic evidence.
- `UAT-664-5`: agent suggestions cannot raise trusted risk or prove safety until
  tools or execution corroborate them.

**Usability**

- Agent selection, command intent, local/cloud boundary, and failure state are
  clear before execution.
- The user can see what context will be sent and how to disable the stage.
- Suggested next actions are specific and include proof/rerun guidance.

**Agentic closed-loop QA**

- Independent QA agent discovers a planted downstream risk not stated in the
  diff summary; a tool/probe confirms it; the builder repairs it; revalidation
  closes the finding.
- Hallucinated risk against a clean decoy remains an untrusted suggestion.
- An attempted unsafe command, auto-commit, or auto-push remains blocked.

**Automation target:** deterministic fake harness in CI plus an opt-in,
non-blocking real-agent evaluation script with explicit configuration.

### #665: Revalidate final agent edits

**User job:** trust that the loop's final report describes the files currently
on disk, even when the last allowed agent round changed them.

**UAT**

- `UAT-665-1`: With `maxRounds: 1`, a final improving edit triggers one final
  analysis/check pass and returns evidence from the edited tree.
- `UAT-665-2`: A final worsening edit appears in the final findings and cannot
  inherit an earlier clean status.
- `UAT-665-3`: The verification-only pass does not invoke the agent again.
- `UAT-665-4`: agent failure, post-edit check failure, no progress, and
  max-round exhaustion remain distinct.
- `UAT-665-5`: progress responds to security, decay, product, and check changes,
  not only merge-risk and weak-test counts.

**Usability**

- A participant can reconstruct the round timeline and identify which revision
  each report/check result describes.
- Terminal status explains the next human action and never implies stale safety.

**Agentic closed-loop QA**

- Run real temporary-repository convergence with an improving final edit and a
  second fixture with a regressing final edit.
- Assert analysis/check call counts, file fingerprints, round state, and final
  evidence freshness.
- A fake agent completion statement has no effect without changed-tree checks.

**Automation target:** harness unit tests, CLI integration, and opt-in real edit
E2E using the built CLI.

### #666: Behavior-specific edge-case ranking

**User job:** see the few production scenarios most likely to break, separated
from generic test and rerun chores.

**UAT**

- `UAT-666-1`: API/auth/database/UI fixtures produce concrete trigger,
  invariant, failure, downstream consumer, confidence, and proof fields.
- `UAT-666-2`: generic “add/run tests for file” items appear under proof/check
  tasks, not edge cases.
- `UAT-666-3`: duplicate scenarios from rules, memory, packs, and agent
  investigation collapse without losing provenance.
- `UAT-666-4`: clean decoys and unrelated pattern packs do not enter the ranked
  top set.
- `UAT-666-5`: high-impact scenarios are not dropped because generic items fill
  an agent-task cap.

**Usability**

- A fresh developer or agent can identify the top user-visible failure and its
  strongest proof command without searching the full report.
- Scenario language describes behavior rather than internal implementation
  shape.
- Overflow and uncertainty are discoverable without overwhelming the default
  output.

**Agentic closed-loop QA**

- QA agent selects a top-ranked planted edge case, creates the missing real-path
  test or repair, and reruns CodeDecay.
- The resolved scenario gains proof or leaves the unresolved top set; unrelated
  decoys remain clean and duplicates do not reappear.

**Automation target:** labeled relevance corpus with top-k precision, planted
scenario recall, deduplication, task-cap, and clean-decoy assertions. Metric
thresholds must be recorded before implementation and cannot be lowered merely
to make the change pass.

### #667: Built CLI and GitHub Action end-to-end proof

**User job:** run the published AI-first workflow locally or in GitHub Actions
and receive the same documented arguments, artifacts, and failure behavior.

**UAT**

- `UAT-667-1`: Pack/build the CLI, install or invoke only the artifact, and run
  `ai` plus `ai preflight` in an isolated git repository.
- `UAT-667-2`: Cover default and alternate profiles, refs, cwd, output, task
  filters, invalid input, checks, safety blocking, and fail thresholds.
- `UAT-667-3`: Execute the Action argument-building/runtime path with a fake CLI
  recorder; assert exact argv, environment, output, stderr, and status.
- `UAT-667-4`: Unsupported argument/mode combinations are not forwarded.
- `UAT-667-5`: Failure propagates while the documented report/summary behavior
  remains best effort.

**Usability**

- Built help and errors let a new user choose the correct mode and fix invalid
  input without reading source.
- Local and Action terminology match.
- Output artifact location and non-zero exit reason are obvious.

**Agentic closed-loop QA**

- Use the built artifact against a seeded child repository, hand its bundle to a
  deterministic fake agent, apply one repair, and re-run the built artifact.
- Verify the final report reflects the repair and no workspace-only imports are
  required.
- Corrupt/missing fake CLI, blocked checks, and failing agent paths remain
  explicit.

**Automation target:** built-artifact Vitest fixtures and a deterministic shell
harness. Evaluate a maintained local Action runner before building a larger
custom runner.

### #668: Framework and language impact adapters

**User job:** understand which real API/UI/job/data behavior a change can affect,
including supported non-JS repositories and framework relationships.

**UAT**

- `UAT-668-1`: One non-JS fixture maps a changed symbol to a real route/job and
  its tests using an OSS or language-native parser.
- `UAT-668-2`: One additional JS/TS framework fixture maps framework-specific
  routes/registries beyond generic imports.
- `UAT-668-3`: Multi-package fixtures connect shared code to API, UI, job/event,
  schema/persistence, and config/env consumers where evidence exists.
- `UAT-668-4`: unrelated dynamic-looking files and name collisions remain clean.
- `UAT-668-5`: unavailable optional tools degrade with capability/limitation
  evidence and no hidden install/network action.

**Usability**

- A participant can tell what is supported, which tool produced an edge, its
  confidence, and why a downstream consumer is included.
- Uncertain edges are visually distinct from proven relationships.
- Setup guidance is actionable without implying mandatory cloud tooling.

**Agentic closed-loop QA**

- QA agent uses a cross-language/framework impact path to identify a missed
  consumer; builder repairs implementation and test proof; revalidation updates
  the graph and task state.
- A speculative dynamic edge cannot independently become verified impact or
  merge safety.

**Automation target:** adapter contract tests, OSS availability/missing-tool
tests, representative repositories, false-positive decoys, and benchmark
precision/recall. The issue records the OSS evaluation before parser code starts.

### #669: Requirement-to-verification traceability

**User job:** answer, for every acceptance criterion, what implements it, what
could break, what proof ran, and what remains unverified.

**UAT**

- `UAT-669-1`: A requirement with API integration proof becomes `verified` and
  links the exact evidence.
- `UAT-669-2`: A differential or product failure becomes `proof-failed`.
- `UAT-669-3`: A criterion with no implementation mapping remains `unmapped`;
  absence of evidence never becomes verified.
- `UAT-669-4`: IDs remain stable through analysis, redteam, agent repair,
  checks, loop rounds, JSON, and Markdown.
- `UAT-669-5`: the optional CI gate fails only for the configured unresolved
  statuses and still writes the trace artifact.

**Usability**

- From the default matrix, a fresh participant can answer which criteria are
  implemented, verified, failed, or awaiting a human.
- Status names, evidence links, and limitations do not require reading JSON.
- The next proof or repair task is clear for every non-verified criterion.

**Agentic closed-loop QA**

- Start with one verified, one proof-missing, and one unmapped criterion.
- Builder repairs the proof-missing path; post-edit checks transition only that
  criterion to verified while stable IDs and other statuses remain correct.
- A hallucinated mapping from an agent stays suggested/needs-human until
  deterministic evidence corroborates it.

**Automation target:** core state-transition tests, report golden files with
semantic assertions, built CLI/MCP round trips, CI exit behavior, and real
closed-loop fixture. This work depends on the requirement model from #663.

## Execution Order

Use this test-first order:

1. #662 trust boundary and #665 loop freshness,
2. #663 requirement model,
3. #664 user-owned investigation,
4. #669 traceability,
5. #666 edge-case relevance,
6. #667 distribution/runtime UAT,
7. #668 broader adapters.

#667 test harness work can proceed alongside the feature sequence, but every
user-facing slice must pass its built-artifact UAT before release.

## Issue and PR Workflow

Every implementation issue should contain a `Pre-code test contract` section
using the structure in this RFC. Every implementation PR should link that
contract and report:

- baseline/red evidence,
- deterministic test evidence,
- UAT evidence,
- usability session evidence,
- agentic closed-loop evidence,
- limitations and skipped scenarios.

If a layer is not applicable, the PR must explain why and name the strongest
replacement evidence. “Unit tests pass” is not a sufficient replacement for UAT
or final-tree revalidation.
