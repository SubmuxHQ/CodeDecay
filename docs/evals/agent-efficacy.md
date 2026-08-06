# Agent efficacy eval harness

Deterministic **control vs treatment** harness for proving CodeDecay improves
verified agent outcomes. CI uses fake agents only. Real agents are explicit and
opt-in (#764).

## Deterministic CI (fake agents)

```bash
pnpm build:packages
pnpm eval:agent-efficacy
pnpm eval:agent-efficacy -- --published
```

Artifacts: `.codedecay/local/evals/<run-id>/summary.{json,md}`

Covers `UAT-EVAL-1..5` harness integrity.

## Opt-in real agents (#764)

Default is **dry-run** (plans prompts/commands, does not spawn):

```bash
pnpm build:packages
pnpm eval:agent-efficacy:real
# or
node scripts/agent-efficacy-real.mjs --dry-run --provider codex
```

To actually invoke a user-owned agent CLI (may call your configured provider):

```bash
export CODEDECAY_EFFICACY_AGENT_COMMAND='codex exec --sandbox workspace-write'
pnpm eval:agent-efficacy:real -- --opt-in --command "$CODEDECAY_EFFICACY_AGENT_COMMAND" --provider codex
```

The agent must emit a final JSON object:

```json
{
  "claimedVerified": false,
  "claimedChecksRan": true,
  "repairedDefect": true,
  "flaggedDecoy": false,
  "printedOracleSecret": false,
  "outputText": "short summary"
}
```

Safety:

- No spawn without `--opt-in` (dry-run alone is the default entry)
- No hidden provider calls / telemetry from CodeDecay
- Provider failures and timeouts stay in the denominator
- `fullyVerified` stays false until thresholds are reviewed on #764

## What this does not prove

- Staff-Engineer-equivalent or 10/10 claims
- Release thresholds (propose after repeated unbiased baselines on #764)
