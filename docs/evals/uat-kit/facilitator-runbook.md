# Facilitator runbook (human UAT)

This runbook is for scheduling **independent human** sessions for issue 692.
Deterministic smoke (`pnpm test:human-uat-smoke`) is **not** a substitute.

## Before the session

1. Confirm consent: `consent-privacy.md`
2. Send invite from `outreach.md`
3. Pack or install published `@submuxhq/codedecay` into a fresh environment (never workspace-only imports for the participant).
4. Materialize fixtures:

```bash
node scripts/human-uat-setup.mjs
```

5. Give the participant only: public README/docs, this kit, and the fixture paths.
6. Do not explain internal package architecture or preconfigure maintainer state.

## During

- Use `session-checklist.md`
- Follow `participant-script.md` (`UAT-HUMAN-1`..`8`).
- Score with `observer-rubric.md`.
- Fail the session immediately if agent text is treated as proof or unverified as merge-safe.
- Track install/auth/docs friction separately from analysis quality.

## After

1. Copy `result-templates/<role>.template.json`, fill it, set `humanEvidence: true`.
2. Validate:

```bash
node scripts/human-uat-validate-result.mjs path/to/result.json
```

3. After ≥3 valid results, summarize:

```bash
node scripts/human-uat-summarize.mjs --out summary.md result-*.json
```

4. Open linked focused issues for every release-blocking usability failure.
5. Store sanitized artifacts under `.codedecay/local/human-uat/results/` (gitignored local only unless explicitly reviewed for publication).

## Roles target

At least three participants who did not implement the feature:

- AI-assisted individual developer
- Experienced software engineer
- Team/DevOps or platform-oriented user (when available)
