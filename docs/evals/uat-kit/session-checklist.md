# Session checklist

Facilitator-facing. Mark during the live session.

## Setup

- [ ] Consent reviewed (`consent-privacy.md`)
- [ ] Package source is npm or packed tarball (not workspace import)
- [ ] Package version recorded
- [ ] Fixtures ready (`planted`, `decoy`, `unsafe`)
- [ ] Participant role recorded

## Tasks

- [ ] UAT-HUMAN-1 Fresh install / first useful result
- [ ] UAT-HUMAN-2 Ambiguous requirement clarified
- [ ] UAT-HUMAN-3 Weak test identified
- [ ] UAT-HUMAN-4 Behavioral probe finds planted defect
- [ ] UAT-HUMAN-5 Repair + revalidate
- [ ] UAT-HUMAN-6 Unsafe/blocked action understood
- [ ] UAT-HUMAN-7 Clean decoy no forced repair
- [ ] UAT-HUMAN-8 Trust levels explained correctly

## Hard fail

- [ ] Participant treated agent text as proof → fail session
- [ ] Participant treated unverified as merge-safe → fail session

## Wrap

- [ ] Result JSON filled from template + validated:
      `node scripts/human-uat-validate-result.mjs <result.json>`
- [ ] Friction categories filled (install/auth/docs separate from analysis)
- [ ] Linked issues opened for blockers
- [ ] After ≥3 valid results: `node scripts/human-uat-summarize.mjs --out summary.md *.json`
