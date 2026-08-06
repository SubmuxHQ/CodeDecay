# Outreach template (independent human UAT)

Copy/adapt. Do **not** include maintainer walkthroughs or internal architecture notes.

## Short invite

Subject: 60–90 min CodeDecay usability session (published npm package)

Hi <Name>,

We're running independent acceptance testing for CodeDecay's published AI
workflow before closing our AI-native milestone. Looking for people who did
**not** implement the feature.

Need ~60–90 minutes:
1. Install `@submuxhq/codedecay` from npm (or a packed tarball we provide)
2. Work through eight scripted tasks on synthetic fixtures
3. Explain what in the report is proof vs suggestion

Roles we're filling:
- AI-assisted individual developer
- Experienced software engineer
- Team/DevOps or platform-oriented user

Consent + privacy: no hidden recording/telemetry; synthetic repos only; no
provider keys or private source collected. Details in
`docs/evals/uat-kit/consent-privacy.md`.

If you're free, reply with role + OS/package manager. Thanks.

## Facilitator checklist before sending

- [ ] Participant did not implement the feature under test
- [ ] Fresh machine or clean temp dir available
- [ ] Packed tarball or npm version pinned
- [ ] Fixtures materialized with `node scripts/human-uat-setup.mjs`
- [ ] Kit link sent: `docs/evals/uat-kit/`
