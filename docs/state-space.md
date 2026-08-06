# State-space safety

CodeDecay evaluates **bounded cache/feature-flag state matrices** from fixture
experiments. It does not flush production caches or contact remote flag
providers without explicit configuration.

## What it can establish

- State dimensions: flags, config, cache state/version, tenant, cohort, revision
- Bounded pairwise or explicit combinations with coverage accounting
- Cold/warm/stale cache comparisons and flag-interaction oracles
- Distinction between confirmed regression, passed oracle, provider-blocked,
  bounds-blocked, and untested/pruned combinations
- Repair tasks that attach a durable regression test id after a confirmed defect

## What it cannot establish

- Exhaustive coverage of the full state space
- Production cache/flag behavior
- A `fullyVerified: true` result (always false in this slice)

## CLI / MCP

```bash
codedecay state-space --experiment experiment.json --surface src/cache/profile.ts
codedecay state-space --experiment experiment.json --target-kind fixture-local --format json
```

MCP tool: `state_space_safety`.
