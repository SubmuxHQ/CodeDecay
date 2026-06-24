# GitHub App Review Skill

Use this skill for changes under `packages/github-app` or `docs/github-app.md`.

## Safety Boundary

The GitHub App v0 must only run deterministic CodeDecay analysis.

It must not:

- run repo-configured commands,
- run tests from user repositories,
- run deployment commands,
- call LLMs or model APIs,
- upload code to CodeDecayCloud,
- log source code or tokens.

## Required Checks

- Webhook events are limited to supported pull request actions.
- GitHub tokens are redacted from errors and logs.
- Temp checkout directories are removed.
- PR comments are marker-based and updated instead of duplicated.
- Check runs complete on success and failure.
- Render docs list required env vars and permissions.

## Validation

```bash
pnpm --filter @submuxhq/codedecay-github-app build
pnpm test
pnpm build
```
