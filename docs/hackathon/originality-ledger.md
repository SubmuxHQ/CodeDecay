# CodeDecay Hackathon Originality and Codex Evidence Ledger

This ledger separates CodeDecay's pre-existing open-source foundation from the
deadline-focused work completed with Codex for the Codex India Hackathon 2026.
It records public task summaries and execution evidence, not hidden
chain-of-thought or private prompts.

## Foundation before the hackathon submission sprint

Before 27 July 2026, the repository already contained the TypeScript CLI,
deterministic analyzers, merge-safety reports, test-audit signals, configured
execution, local memory and skills, MCP, GitHub Action support, JSON/Markdown/
SARIF renderers, a child-repository demo harness, and the v0.3.5 deterministic
benchmark corpus.

The hackathon submission does not present that mature foundation as newly
created during the final sprint. The work below is the public judge-facing
slice planned, executed, and self-reviewed with Codex.

## Hackathon-period ledger

| Date/time (IST) | Issue/task and foundation boundary | Codex surface and public planning evidence | Files/components changed | Commands and tests executed | Human decision, public result, and remaining limitation |
| --- | --- | --- | --- | --- | --- |
| 27 Jul 2026, 17:14 | [#697](https://github.com/SubmuxHQ/CodeDecay/issues/697): the benchmark corpus and CLI tests already existed; the hackathon change removed a full-suite timeout flake without weakening assertions. | Codex task with issue-scoped branch, failure reproduction, fixture diagnosis, and CI monitoring. | CLI benchmark test fixture and git identity setup. | Focused Vitest reproduction, full `pnpm test`, lint, typecheck, build, package dry-run, GitHub checks. | [PR #701](https://github.com/SubmuxHQ/CodeDecay/pull/701), commit `3b90b09`. Squash-merged after green checks. Limitation: this improves determinism, not benchmark coverage. |
| 27 Jul 2026, 17:27 | [#693](https://github.com/SubmuxHQ/CodeDecay/issues/693): preflight, red-team, agent bundles, and execution primitives existed; the hackathon change made `codedecay ai` the coherent recommended entry point. | Codex planned the before/during/after flow, implemented CLI and Action wiring, and reviewed evidence boundaries. | CLI parsers/commands/docs, Action inputs and workflow surface. | CLI tests, Action tests, lint, typecheck, full suite, build, package checks. | [PR #700](https://github.com/SubmuxHQ/CodeDecay/pull/700), commit `4ef8e95`. Limitation: AI reasoning remains explicit and user-owned; no hosted model is bundled. |
| 27 Jul 2026, 17:51 | [#667](https://github.com/SubmuxHQ/CodeDecay/issues/667): source-level command tests existed; the hackathon change proved packed CLI and Action shell forwarding behavior. | Codex used an issue-scoped acceptance plan and clean consumer repositories rather than string-only assertions. | Built CLI acceptance and GitHub Action shell harness. | Packed artifact install, `ai`, `ai preflight`, profiles, refs, output, checks, safety/exit cases, full CI. | [PR #702](https://github.com/SubmuxHQ/CodeDecay/pull/702), commit `c1f301f`. Limitation: the harness is deterministic acceptance, not a real provider efficacy study. |
| 27 Jul 2026, 18:25 | [#666](https://github.com/SubmuxHQ/CodeDecay/issues/666): deterministic edge-case generation existed; the hackathon-relevant change grounded investigation in explicit verification state. | Codex investigation/review task tied suggestions to current verification context. | Red-team investigation and AI workflow evidence context. | Focused tests plus repository validation in PR CI. | [PR #706](https://github.com/SubmuxHQ/CodeDecay/pull/706), commit `cba0d2d`. The larger behavior-specific ranking issue remains open and is not claimed complete. |
| 27 Jul 2026, 18:27 | [#695](https://github.com/SubmuxHQ/CodeDecay/issues/695): analyzers, reports, and benchmarks existed; the hackathon change built the public judge-facing application and deployment proof. | Codex created a multi-step plan, implemented the app, used image generation once for the social card, ran CodeDecay self-review, fixed discovered evidence/CI gaps, deployed with exact source provenance, and performed anonymous browser/API smoke. | `judge-lab/`, Sites configuration, live API engine path, weak-test artifact generator, security headers, responsive UI, tests, CI. | Root lint/typecheck/616 tests/build/package; 5 worker/API tests; 8 desktop/mobile browser tests; axe checks; npm audit; production curl/browser checks; GitHub CI. | [PR #704](https://github.com/SubmuxHQ/CodeDecay/pull/704), commit `4eca966`; [public Judge Lab](https://codedecay-judge-lab.kunal277075.chatgpt.site). Limitation: fixed curated scenarios only; arbitrary repositories are intentionally rejected. |
| 27 Jul 2026 | [#694](https://github.com/SubmuxHQ/CodeDecay/issues/694), [#696](https://github.com/SubmuxHQ/CodeDecay/issues/696), [#698](https://github.com/SubmuxHQ/CodeDecay/issues/698), [#699](https://github.com/SubmuxHQ/CodeDecay/issues/699): the repository existed; Codex decomposed the viability, demo, release, and originality gates into focused public workstreams. | Public GitHub issues are the user-visible planning artifact. Codex work is represented by scoped branches, tool calls, commits, PRs, checks, and deployed artifacts rather than hidden reasoning. | Milestone, issue specifications, demo/release/submission sources. | Link audits, clean-checkout release gates, public deployment checks, document render QA, and final submission verification as each workstream completes. | This row remains active until the immutable release, video, public Google Doc, and BlockseBlock `Submitted` status are verified. |

## Evidence interpretation

- **Planning evidence:** public issue scope, acceptance criteria, and branch/PR
  boundaries.
- **Execution evidence:** repository diffs, generated artifacts, tool output,
  GitHub Actions, Sites versions, and production requests.
- **Self-review evidence:** CodeDecay red-team findings, clean-checkout
  reproductions, accessibility checks, dependency audit, and production log
  inspection that caused follow-up fixes.
- **Human decisions:** release scope, public access, safety boundaries,
  deterministic-versus-suggestion labeling, and refusal to overclaim planted
  benchmark results.

## Explicitly incomplete evidence

The following open work is not silently treated as complete:

- [#683](https://github.com/SubmuxHQ/CodeDecay/issues/683): paired, repeated
  real-agent control/treatment outcome evaluation.
- [#692](https://github.com/SubmuxHQ/CodeDecay/issues/692): independent
  three-participant published-workflow UAT.
- [#696](https://github.com/SubmuxHQ/CodeDecay/issues/696): final public
  three-minute demo and comprehension check.
- [#698](https://github.com/SubmuxHQ/CodeDecay/issues/698): immutable package,
  tag, release, and cross-surface identity.
- [#699](https://github.com/SubmuxHQ/CodeDecay/issues/699): public Google Doc,
  final link matrix, and BlockseBlock confirmation.

Until those gates are complete, CodeDecay makes no claim of guaranteed safe
merges, production accuracy, universal agent improvement, or staff-engineer
equivalence.
