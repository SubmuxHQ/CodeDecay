# Ready-to-send outreach (#763)

Copy one message per role. Replace `<Name>` / scheduling bits. Do **not** add
maintainer walkthroughs or internal architecture notes.

Consent link to include: `docs/evals/uat-kit/consent-privacy.md`  
Kit: `docs/evals/uat-kit/` · Live ops: `docs/evals/uat-kit/live-session.md`

---

## 1) AI-assisted individual developer

**Subject:** 60–90 min CodeDecay session (AI-assisted workflow)

Hi `<Name>`,

Looking for an AI-assisted developer who did **not** build CodeDecay to run a
short independent usability session.

You'll install the published/`packed` `@submuxhq/codedecay` package, use your
own coding agent (or deterministic no-model mode), and walk eight scripted tasks
on a synthetic broken-auth fixture: find weak tests, repair, revalidate, and
explain what in the report is proof vs suggestion.

~60–90 minutes. No customer data, no provider-key collection, no hidden
telemetry. Synthetic repos only.

If you're free this week, reply with timezone + OS/package manager (npm/pnpm/bun).
Happy to send a calendar hold + the participant script.

Thanks,  
`<Your name>`

---

## 2) Experienced software engineer

**Subject:** Independent CodeDecay acceptance session (experienced eng)

Hi `<Name>`,

Need an experienced engineer (not a CodeDecay implementer) for a task-based
acceptance pass on the published AI PR-safety workflow.

Goal: can a careful engineer install from npm/tarball, discover `codedecay ai`,
clarify an ambiguous requirement, catch a planted auth/API bug that unit tests
miss, repair + revalidate, and correctly refuse to treat agent text as proof.

~60–90 minutes on synthetic fixtures. Consent/privacy notes attached; we only
keep anonymized task timings and trust-comprehension scores.

If yes, send 2–3 slots this week and whether you prefer Zoom or async terminal
share. I'll send the packed binary path and participant script only — no
architecture tour.

Thanks,  
`<Your name>`

---

## 3) Team / DevOps / platform

**Subject:** CodeDecay platform/DevOps usability check (60–90m)

Hi `<Name>`,

Looking for a team/DevOps or platform-oriented user who didn't implement
CodeDecay to validate the published-package install + safety boundaries.

You'll hit install/package-manager friction, run configured checks with
`allowCommands` constraints, confirm an unsafe/disabled execution path is
skipped/blocked and understood, and separate docs/auth/install friction from
analysis quality.

~60–90 minutes. Synthetic repos; no secrets; no hidden recording.

Reply with role confirmation + availability. I'll send consent notes + the
session checklist (no maintainer preconfiguration).

Thanks,  
`<Your name>`

---

## Facilitator send checklist

- [ ] Recipient did not implement the feature
- [ ] Role slot still open (ai-assisted / experienced / devops)
- [ ] `pnpm uat:start-session -- --run-id <id>` ready before the call
- [ ] Packed tarball / npm version pinned in the invite thread
- [ ] After session: fill `results/<role>.pending.json`, set `humanEvidence: true`, validate, attach on #763
