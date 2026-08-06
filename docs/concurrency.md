# Concurrency safety

CodeDecay evaluates **deterministic fixture oracles** for retries, duplicate
delivery, lost updates, and idempotency. It does not spawn a distributed
scheduler or contact production queues.

## What it can establish

- Experiment inputs: actors, operations, seeded schedules, retry/duplicate
  policy, fault points, state oracle, bounds, cleanup
- Candidate surfaces from routes/jobs/locks/idempotency/retry mentions
  (keyword = candidate, not proof)
- Falsifiable invariants: exactly-once, at-least-once-safe, no-lost-update,
  monotonic state, bounded retries, compensating action
- Deterministic barrier schedules with reproducible seeds
- Bound gates for parallelism, repetitions, timeout, and network targets
- Distinction between confirmed race, passed oracle, inconclusive stress,
  bounds-blocked, and needs-human
- Repair tasks that attach a durable regression test id after a confirmed defect

## What it cannot establish

- Absence of races in production
- Safety from low-repetition probabilistic stress alone
- A `fullyVerified: true` result (always false in this slice)
- Queue/webhook/cron/lock/outbox execution (extension boundaries only)

## CLI / MCP

```bash
codedecay concurrency --experiment experiment.json --surface src/jobs/payout.ts
codedecay concurrency --experiment experiment.json --target-kind fixture-local --format json
```

MCP tool: `concurrency_safety`.

Approved bounded execution through the execution package remains a future
adapter; this slice stays local, deterministic, and command-free.
