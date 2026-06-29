# Benchmark Corpus

CodeDecay keeps an explicit regression-signal benchmark corpus in the repo so
scoring changes are forced through representative cases instead of anecdotes.

## What The Corpus Covers

The current benchmark set includes:

- low-signal docs or copy style changes that must stay below headline high risk
- asset-only changes such as SVGs, images, fonts, and other static files
- lockfile-only changes that should not be treated like source behavior changes
- package metadata-only changes such as description and keyword updates
- medium-risk behavior changes that should stay visible without being inflated
- clearly risky auth or API changes that should remain high signal
- a unified harness planted-issue corpus with SQL injection, hardcoded secret,
  missing auth, path traversal, SSRF, command injection, unsafe HTML rendering,
  weak/fake tests, missing real API coverage, high complexity, duplicate logic,
  config changes, and database/schema regressions

## How It Is Enforced

The benchmark cases run in CI through the test suite. Each case locks:

- expected risk level
- allowed score range
- key findings that must remain present
- deterministic recall for planted security, regression, decay, and weak-test
  signals
- skipped/capped file counts, unsupported-file limitations, duration, and cost
  metadata for the unified harness corpus

That means a scoring tweak that turns a low-signal case into severe risk, or
hides a clearly risky case, fails in CI.

Run the benchmark directly with:

```bash
pnpm eval:benchmark
```

The deterministic benchmark cost must remain `$0`: it does not call models,
providers, APIs, hosted services, or telemetry. Optional AI precision checks
should live outside this CI benchmark.

## How To Add A Case

1. Add a new benchmark case in the benchmark test file.
2. Describe the intent of the case in plain language.
3. Set the expected score range and expected key findings.
4. Explain why the case should stay low, medium, or high signal.
5. For planted-issue cases, add the expected rule id to the recall list and
   keep the fixture deterministic.

Keep the corpus small and representative. The goal is calibration, not a giant
fixture zoo.
