# Test Proof Audit

CodeDecay summarizes deterministic test signals into a test proof audit.

The audit asks:

```text
Are the changed tests actually proving the changed behavior will not break?
```

The first implementation is deterministic and uses existing analyzer findings.
It does not run mutation testing, execute commands, call models, or use cloud
services.

## Statuses

- `missing`: changed source behavior does not have nearby changed test proof.
- `weak`: changed tests exist, but deterministic rules found weak proof
  signals.
- `present`: changed tests are present and no deterministic weak-test signals
  were found.
- `not_applicable`: no changed source or test files require a test proof audit.

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

Future adapters such as StrykerJS can add stronger mutation-testing evidence to
this audit. They should remain explicit, local-first, and opt-in.
