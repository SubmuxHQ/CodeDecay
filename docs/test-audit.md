# Test Evidence Audit

CodeDecay summarizes deterministic and runtime-backed test signals into a test
evidence audit.

The audit asks:

```text
Are the changed tests producing meaningful evidence that the changed behavior is safe?
```

The first implementation starts with deterministic analyzer findings and can
augment them with runtime coverage artifacts when they are present. It does not
run mutation testing, execute commands, call models, or use cloud services.

## Evidence Modes

- `heuristic_only`: no runtime coverage artifact was found, so the audit uses
  deterministic signals only.
- `runtime_augmented`: CodeDecay found runtime coverage artifacts and mapped
  changed files or lines to measured execution.

Current coverage sources:

- Istanbul `coverage-final.json`
- LCOV `lcov.info`
- V8 JSON coverage

Changed source classification currently includes JavaScript, TypeScript, and
Python (`.py`) files. Python projects should provide LCOV or another supported
coverage artifact from their own test runner; CodeDecay maps the artifact to
changed lines but does not run pytest automatically.

Use `toolAdapters.coverage` when you want CodeDecay to run an explicit local
coverage command or collect existing coverage artifacts during `codedecay
execute`. The analyzer still owns changed-line coverage mapping in
`analyze`, `redteam`, and `agent` reports.

## Statuses

- `missing`: changed source behavior does not have nearby changed test evidence.
- `weak`: changed tests exist, but CodeDecay found weak evidence
  signals.
- `present`: changed tests are present and no weak evidence signals were found.
- `not_applicable`: no changed source or test files require a test evidence
  audit.

## Current Signals

The audit consumes existing analyzer findings, including:

- `missing-nearby-tests`
- `test-without-assertions`
- `snapshot-only-test`
- `mocked-changed-source`
- `unrelated-test-change`
- `copied-implementation-in-test`
- `happy-path-only-test`
- `heavy-mocking`
- `test-bloat`

## Future OSS Adapters

Adapters such as coverage and StrykerJS can add stronger runtime or mutation
evidence to this audit. They remain explicit, local-first, and opt-in.
