# Facilitator runbook (human UAT)

This runbook is for scheduling **independent human** sessions for issue 692.
Deterministic smoke (`pnpm test:human-uat-smoke`) is **not** a substitute.

## Before the session

1. Confirm consent: `consent-privacy.md`
2. Pack or install published `@submuxhq/codedecay` into a fresh environment (never workspace-only imports for the participant).
3. Materialize fixtures:

```bash
node scripts/human-uat-setup.mjs
```

4. Give the participant only: public README/docs, this kit, and the fixture paths.
5. Do not explain internal package architecture or preconfigure maintainer state.

## During

- Follow `participant-script.md` (`UAT-HUMAN-1`..`8`).
- Score with `observer-rubric.md`.
- Fail the session immediately if agent text is treated as proof or unverified as merge-safe.
- Track install/auth/docs friction separately from analysis quality.

## After

1. Fill `result.schema.json` (one file per participant).
2. Fill `summary.template.md` (anonymized).
3. Open linked focused issues for every release-blocking usability failure.
4. Store sanitized artifacts under `.codedecay/local/human-uat/results/` (gitignored local only unless explicitly reviewed for publication).

## Roles target

At least three participants who did not implement the feature:

- AI-assisted individual developer
- Experienced software engineer
- Team/DevOps or platform-oriented user (when available)
