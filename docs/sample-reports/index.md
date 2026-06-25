# Sample CodeDecay Reports

These reports show the output CodeDecay produces for a realistic JavaScript and
TypeScript pull request.

The sample diff changes:

- a UI route: `app/dashboard/page.tsx`
- an API route: `src/api/users.ts`
- an auth/session file: `src/auth/session.ts`
- a Prisma schema file: `prisma/schema.prisma`
- a build/runtime config file: `vite.config.ts`

The reports were generated with the local CodeDecay CLI from a temporary git
repository containing those changes.

## What To Read First

Start with the Markdown report:

- [sample-report.md](/sample-reports/sample-report)

Look at these sections first:

- **Overall risk**: the high-level merge risk and decay scores.
- **Likely Impacted Areas**: the app surfaces CodeDecay thinks may be affected.
- **Likely Impacted Routes And APIs**: concrete user/API paths to verify when
  framework-aware route evidence is available.
- **High Risk Findings**: the findings most likely to need reviewer attention.
- **Recommended Checks**: tests or manual checks to run before merge. Prefer
  checks that exercise the real route, API, UI, database, or downstream path
  instead of only helper-level behavior.

For automation and integrations:

- <a href="./sample-report.json">sample-report.json</a> is the stable machine-readable report.
- <a href="./sample-report.sarif">sample-report.sarif</a> is the code-scanning-oriented report.

CodeDecay generated these reports locally without telemetry, API keys, LLMs, or
model calls.
