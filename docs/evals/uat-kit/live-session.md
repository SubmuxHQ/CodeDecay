# Live session ops (issue 692)

Independent humans still required. This page is the facilitator ops path after kit
scaffolding is complete.

## Start a session workspace

```bash
pnpm build:packages
node scripts/human-uat-start-session.mjs --run-id <id>
```

Creates under `.codedecay/local/human-uat/session/<id>/`:

- `fixtures/` planted + decoy + unsafe
- `pack/` + `consumer/` fresh packed-tarball install of `@submuxhq/codedecay`
- `results/*.pending.json` blank role templates
- `readiness.json` path map

## Recruit

Use `outreach.md`. Need three people who did **not** implement the feature:

1. AI-assisted individual developer
2. Experienced software engineer
3. Team/DevOps or platform-oriented user

## Run

1. Consent: `consent-privacy.md`
2. Checklist: `session-checklist.md`
3. Tasks: `participant-script.md`
4. Participant uses the session `consumer/node_modules/.bin/codedecay` only
5. Fill `results/<role>.pending.json`, set `humanEvidence: true`
6. Validate + summarize:

```bash
node scripts/human-uat-validate-result.mjs path/to/result.json
node scripts/human-uat-summarize.mjs --out summary.md result-*.json
```

## Hard rules

- Agent role-play is not human evidence.
- Maintainer self-runs are rehearsals only (`humanEvidence` must stay false / not submitted).
- Mistaken trust (agent text as proof, unverified as merge-safe) fails the session.
