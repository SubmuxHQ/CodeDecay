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

## Weak-Test Regression Walkthrough

This walkthrough shows the intended review loop for a PR that looks tested but
does not prove the real behavior.

1. A PR changes `src/routes/users.ts` so `GET /users` accepts
   `includeDisabled=true`.
2. The PR also changes `src/routes/users.test.ts`, but the test only calls a
   mocked `findUsers()` helper and asserts that the mock was called. It never
   sends a request through the real route, auth helper, or response serializer.
3. `codedecay redteam --format markdown` reports:

   ```text
   Test proof status: weak
   Verification status: not-run
   Task: Strengthen test proof [Missing proof]
   ```

4. The report should not be read as "the PR is broken." It means the current
   tests do not prove the changed production path works for a real caller.
5. The coding-agent task is to add proof on the real path, for example:

   ```text
   Add an integration test that performs GET /users?includeDisabled=true
   through the real route with an authorized and unauthorized session.
   Cover empty result, disabled users present, malformed query value, and
   default includeDisabled=false behavior.
   ```

6. After the stronger test exists, run a configured command:

   ```bash
   npx codedecay redteam --with-checks --format markdown
   ```

7. A stronger result should show the route/test task resolved and
   `verificationStatus: verified` only when the configured checks pass. If
   commands are disabled, skipped, blocked, or failing, CodeDecay keeps the
   report in `unverified`, `blocked`, or `failed` instead of pretending the PR is
   proven safe.

This is the core "fake confidence" rule: a changed test is not enough. The test
must exercise the real user, API, database, or downstream path that the PR
changed.

## Future OSS Adapters

Adapters such as coverage and StrykerJS can add stronger runtime or mutation
evidence to this audit. They remain explicit, local-first, and opt-in.
