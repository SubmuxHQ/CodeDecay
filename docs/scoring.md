# Scoring Model

CodeDecay produces three scores from 0 to 100.

## Merge Risk

Merge risk estimates how likely the PR is to break behavior that reviewers or CI
should care about before merge.

Signals include:

- API route changes
- transitive route or API impact through local import chains
- auth/session/security changes
- database/schema changes
- config/build/deployment changes
- risky source changes without nearby test changes
- heavy mocking that may weaken regression confidence

Low-signal changes are dampened before scoring. Asset-only changes, docs-only
changes, lockfile-only changes, and package metadata-only changes stay low
unless they are paired with source, dependency, runtime config, or structural
changes.

Runtime config plus database/schema changes receive a small structural lift.
That combination is treated as production-sensitive because it can change
deployment defaults and persisted behavior in the same PR.

## Decay Score

Decay score estimates whether the PR makes the codebase harder to maintain.

Signals include:

- duplicated added logic
- large changed functions
- high function complexity
- compiler or linter suppressions
- unchecked TypeScript escape hatches
- broad unrelated change sets
- large test changes weakly connected to source changes

## Security Score

Security score estimates whether the PR introduces or changes
security-sensitive behavior that should be reviewed before merge.

Signals include deterministic matcher candidates for:

- SQL injection
- hardcoded secrets
- command injection
- path traversal
- server-side request forgery
- unsafe HTML rendering
- public route/controller entry points without obvious auth guards
- insecure cookie/session configuration

Security matchers run in the free deterministic analysis pass. They do not call
an LLM, API, cloud service, or hosted scanner.

Matcher hits are candidates and findings, but they are not a gate. In diff
mode, CodeDecay analyzes every changed source file in scope whether or not a
security matcher fires. Matcher misses must not silently remove a changed file
from analysis.

## Thresholds

- `0-39`: low
- `40-69`: medium
- `70-100`: high

Scores are capped by the highest relevant finding severity. A report with only
low-severity merge-risk findings stays low, even if many low findings are
present. A report with only medium-severity merge-risk findings stays at most
medium. High risk requires high-severity evidence.

When a merge-risk or decay score is built only from heuristic signals,
CodeDecay applies a dampener and caps that breakdown at `54/100` so broad
low-signal diffs do not escalate into headline high risk without direct
evidence.

The v1 scoring model is deterministic. The same diff should produce the same
score.

## Score Breakdown

Reports include:

- `mergeRiskBreakdown`
- `decayBreakdown`
- `securityBreakdown`

Each breakdown records:

- top contributors
- whether the contributor is `direct`, `heuristic`, or `structural`
- any dampeners that lowered the final score
- notes about severity caps or heuristic-only handling

This is meant to answer two questions quickly:

1. what raised the score
2. what can lower it again

As a rule of thumb:

- reduce merge risk by adding real route/API/auth/database checks and removing
  brittle test patterns
- reduce decay risk by shrinking changed functions, removing duplicate logic,
  and avoiding suppressions or unchecked escape hatches
- reduce security risk by removing unsafe sinks, adding validation or auth
  guards, using safe APIs, and adding tests or configured checks that exercise
  the real security-sensitive path

## Calibration

CodeDecay keeps public calibration cases in the repo so low-signal changes stay
low and obviously risky changes stay visible.

See [Benchmark corpus](benchmark-corpus.md).

## No LLM Required

CodeDecay does not call a model to decide risk. It uses git diff data,
path-based impact detection, local JS/TS source analysis, deterministic
security matchers, and deterministic rules.
