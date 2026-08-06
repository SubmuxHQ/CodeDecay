# Resilience safety

CodeDecay evaluates **bounded fault / mixed-version matrices** from fixture
experiments. It does not intercept production traffic or inject chaos.

## What it can establish

- Fault profiles: timeout, connection failure, 5xx, malformed response, recovery
- Mixed-version producer/consumer cells for rolling-deploy risk
- Retry/request/resource bounds even when an app retries indefinitely
- Distinction between confirmed defect, passed oracle, target-blocked, bounds-blocked
- Repair/revalidate tasks after a confirmed defect

## What it cannot establish

- General resilience from one passing fault mode
- A `fullyVerified: true` result (always false in this slice)
- Live Toxiproxy/Testcontainers execution (extension boundaries only)

## CLI / MCP

```bash
codedecay resilience --experiment experiment.json --surface src/clients/payments.ts
codedecay resilience --experiment experiment.json --target-kind fixture-local --format json
```

MCP tool: `resilience_safety`.
