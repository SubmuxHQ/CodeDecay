# Agent efficacy eval harness

Deterministic **control vs treatment** harness for proving CodeDecay improves
verified agent outcomes. CI uses fake agents only.

## Run

```bash
pnpm build:packages
pnpm eval:agent-efficacy
pnpm eval:agent-efficacy -- --published
```

Artifacts: `.codedecay/local/evals/<run-id>/summary.{json,md}`

## What this proves

- Paired control/treatment schema (`UAT-EVAL-1`)
- Cheating agents fail (`UAT-EVAL-2`)
- Label-swap / answer-leak detection (`UAT-EVAL-3`)
- Published-package treatment schema parity (`UAT-EVAL-4`)
- Provider timeout/unavailable stays in denominator (`UAT-EVAL-5`)

## What this does not prove

- Real Codex/Claude/BYOK efficacy
- Staff-Engineer-equivalent or 10/10 claims
- Release thresholds (set after an unbiased real-agent baseline)

Opt-in real-agent trials remain required before closing efficacy claims on #675.
