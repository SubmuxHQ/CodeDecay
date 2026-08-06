# Human UAT fixtures

Synthetic repositories used by the kit and the deterministic CI smoke.

## Materialize

```bash
node scripts/human-uat-setup.mjs
# default output: .codedecay/local/human-uat/fixtures/
```

| Fixture | Purpose | Task IDs |
|---|---|---|
| `planted/` | Auth/API regression with passing weak unit test | UAT-HUMAN-2..5, UAT-HUMAN-8 |
| `decoy/` | Docs-only clean change | UAT-HUMAN-7 |
| `unsafe/` | Configured commands with `allowCommands: false` | UAT-HUMAN-6 |

## Planted oracle

- `npm test` passes (shallow session unit test).
- `npm run probe:anonymous` fails until repaired (`GET /api/invoices` must be `401`).
- Ambiguous requirement text lives in `README.md` for clarification practice.

## Deterministic smoke

```bash
pnpm build:packages
pnpm test:human-uat-smoke
```

Smoke proves fixture + CLI workflow drift only. It sets `humanEvidence: false` and
must never be used to finish human acceptance for issue 692.
