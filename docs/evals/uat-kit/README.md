# Human UAT kit (issue 692)

This kit prepares independent human acceptance testing. **Issue 692 cannot finish
without independent human participants.** Do not treat agent role-play, synthetic
sample results, or the deterministic CI smoke as human acceptance evidence.

## Contents

| Path | Purpose |
|---|---|
| `participant-script.md` | Task sequence for UAT-HUMAN-1..8 |
| `observer-rubric.md` | Scoring for comprehension and safety |
| `consent-privacy.md` | Consent + no telemetry / no secret collection |
| `facilitator-runbook.md` | How to schedule and run sessions |
| `outreach.md` | Invite copy for independent participants |
| `outreach-messages.md` | Ready-to-send messages for the three roles |
| `session-checklist.md` | Live-session facilitator checklist |
| `live-session.md` | One-command session workspace + recruit/run ops |
| `fixtures.md` | Planted / decoy / unsafe fixture guide |
| `tasks.json` | Machine-readable task IDs |
| `result.schema.json` | Machine-readable participant result schema |
| `result-templates/` | Blank per-role JSON starters |
| `summary.template.md` | Anonymized Markdown summary template |

## How to run (when humans are scheduled)

1. Pack/publish `@submuxhq/codedecay` and install into a fresh environment.
2. Or run `node scripts/human-uat-start-session.mjs` for fixtures + packed consumer.
3. Recruit with `outreach.md`; run the session with `session-checklist.md` / `live-session.md`.
4. Fill a `result-templates/*.template.json` copy; set `humanEvidence: true`.
5. Validate: `node scripts/human-uat-validate-result.mjs <result.json>`
6. After ≥3 valid results: `node scripts/human-uat-summarize.mjs --out summary.md *.json`
7. File linked issues for every release-blocking usability failure.

## CI smoke

```bash
pnpm build:packages
pnpm test:human-uat-smoke
```

Smoke validates kit files, fixture oracles, planted vs decoy analyze signal,
`allowCommands: false` execute skipping, and result validate/summarize tooling
against **synthetic** samples under `scripts/fixtures/human-uat/sample-results/`.
That smoke is **not** human evidence.
