# Human UAT kit (issue 692)

This kit prepares independent human acceptance testing. **Issue 692 cannot finish
without independent human participants.** Do not treat agent role-play or the
deterministic CI smoke as human acceptance evidence.

## Contents

| Path | Purpose |
|---|---|
| `participant-script.md` | Task sequence for UAT-HUMAN-1..8 |
| `observer-rubric.md` | Scoring for comprehension and safety |
| `consent-privacy.md` | Consent + no telemetry / no secret collection |
| `facilitator-runbook.md` | How to schedule and run sessions |
| `fixtures.md` | Planted / decoy / unsafe fixture guide |
| `tasks.json` | Machine-readable task IDs |
| `result.schema.json` | Machine-readable participant result schema |
| `summary.template.md` | Anonymized Markdown summary template |

## How to run (when humans are scheduled)

1. Pack/publish `@submuxhq/codedecay` and install into a fresh environment.
2. Materialize fixtures: `node scripts/human-uat-setup.mjs`
3. Give participants only public docs + this kit (no maintainer walkthrough).
4. Record results with `result.schema.json`.
5. File linked issues for every release-blocking usability failure.

## CI smoke

```bash
pnpm build:packages
pnpm test:human-uat-smoke
```

Smoke validates kit files, fixture oracles, planted vs decoy analyze signal, and
`allowCommands: false` execute skipping. That smoke is **not** human evidence.
