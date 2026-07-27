# First PR Safety Efficacy Benchmark

This benchmark is a small, deterministic proof that CodeDecay can catch seeded PR risks that ordinary passing tests miss.

It is not a claim that CodeDecay makes every PR safe. It is a regression harness for the product promise: find what a coding agent may have missed before merge.

## How to run

```bash
pnpm eval:pr-safety -- --run-id local-pr-safety-eval
```

Artifacts are written under `.codedecay/local/evals/<run-id>/`.

## Current benchmark result

- Status: passed
- Scenarios: 2
- Issues: 0
- Edge-case relevance: 100.0%
- Edge-case noise: 0.0%

## Scenarios

### API/auth regression hidden by copied implementation tests

A coding agent can add tests that mirror the changed implementation while missing the real API authorization regression.

| Signal | Result |
| --- | --- |
| Scenario status | passed |
| Baseline tests | exit 0 |
| Baseline behavior probe | exit 0 |
| Risky weak tests | exit 0 |
| Risky behavior probe | exit 1 |
| CodeDecay risk | high (92/100 merge, 0/100 decay) |
| Test proof status | weak |
| Weak-test findings | 2 |
| Missing-test findings | 0 |
| Edge-case relevance | 100.0% |
| Edge-case noise | 0.0% |

Expected evidence:

- Pass: baseline tests pass
- Pass: baseline behavior probe passes
- Pass: risky weak tests still pass
- Pass: risky behavior probe catches regression
- Pass: CodeDecay reports high risk
- Pass: CodeDecay reports expected impacted areas
- Pass: CodeDecay reports expected finding rules
- Pass: Redteam report classifies test proof correctly
- Pass: Redteam report contains expected weak-test evidence
- Pass: Redteam report contains expected missing-test evidence
- Pass: Redteam report returns structured behavior scenarios
- Pass: Redteam report includes required behavior scenarios
- Pass: Redteam edge-case relevance meets the fixture threshold
- Pass: Generic proof chores are not rendered as edge cases
- Pass: Redteam report creates fix tasks
- Pass: Redteam fix tasks are actionable

### Config/database runtime regression missed by normal tests

A PR can pass a narrow unit test while changing runtime defaults and database semantics that affect production behavior.

| Signal | Result |
| --- | --- |
| Scenario status | passed |
| Baseline tests | exit 0 |
| Baseline behavior probe | exit 0 |
| Risky weak tests | exit 0 |
| Risky behavior probe | exit 1 |
| CodeDecay risk | high (72/100 merge, 0/100 decay) |
| Test proof status | missing |
| Weak-test findings | 0 |
| Missing-test findings | 1 |
| Edge-case relevance | 100.0% |
| Edge-case noise | 0.0% |

Expected evidence:

- Pass: baseline tests pass
- Pass: baseline behavior probe passes
- Pass: risky weak tests still pass
- Pass: risky behavior probe catches regression
- Pass: CodeDecay reports high risk
- Pass: CodeDecay reports expected impacted areas
- Pass: CodeDecay reports expected finding rules
- Pass: Redteam report classifies test proof correctly
- Pass: Redteam report contains expected weak-test evidence
- Pass: Redteam report contains expected missing-test evidence
- Pass: Redteam report returns structured behavior scenarios
- Pass: Redteam report includes required behavior scenarios
- Pass: Redteam edge-case relevance meets the fixture threshold
- Pass: Generic proof chores are not rendered as edge cases
- Pass: Redteam report creates fix tasks
- Pass: Redteam fix tasks are actionable

## Safety boundaries

- No telemetry.
- No cloud dependency.
- No API keys.
- No LLM/model calls.
- Fixtures run inside local temporary git repositories.

The benchmark uses deterministic CodeDecay reports plus explicit behavior probes. AI or agent suggestions should be evaluated separately from this tool evidence.
