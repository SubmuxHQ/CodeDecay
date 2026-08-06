# Human UAT kit (scaffolding for #692)

This kit is scaffolding only. **#692 cannot close without independent human
participants.** Do not treat agent role-play as human acceptance.

## Contents

| Path | Purpose |
|---|---|
| `participant-script.md` | Task sequence for UAT-HUMAN-1..8 |
| `observer-rubric.md` | Scoring for comprehension and safety |
| `consent-privacy.md` | Consent + no telemetry / no secret collection |
| `result.schema.json` | Machine-readable participant result schema |
| `summary.template.md` | Anonymized Markdown summary template |

## How to run (when humans are scheduled)

1. Pack/publish `@submuxhq/codedecay` and install into a fresh environment.
2. Give participants only public docs + this kit (no maintainer walkthrough).
3. Use synthetic fixtures under `scripts/fixtures/end-user-demo/` / new kit fixtures.
4. Record results with `result.schema.json`.
5. File linked issues for every release-blocking usability failure.

## CI smoke

`pnpm test` / kit path checks may validate that these files exist and schema
parses. That smoke is **not** human evidence.
