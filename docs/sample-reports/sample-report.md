## CodeDecay Report

**Overall risk:** High

| Score | Value |
| --- | ---: |
| Merge risk | 100/100 |
| Decay risk | 62/100 |

| Findings | Count |
| --- | ---: |
| High | 5 |
| Medium | 4 |
| Low | 0 |

### Changed Files

- `app/dashboard/page.tsx` modified (+1/-1)
- `prisma/schema.prisma` modified (+3/-1)
- `src/api/users.ts` modified (+5/-1)
- `src/auth/session.ts` modified (+6/-1)
- `vite.config.ts` modified (+4/-1)

### Likely Impacted Areas

- High **API surface** (api): `src/api/users.ts`
- High **Authentication and authorization** (auth): `src/auth/session.ts`
- High **Database and schema** (database): `prisma/schema.prisma`
- Medium **Build and runtime configuration** (config): `vite.config.ts`
- Medium **UI route** (ui): `app/dashboard/page.tsx`

### Likely Impacted Routes And APIs

- Medium `/dashboard` (Next.js UI route): `app/dashboard/page.tsx`

### High Risk Findings

- **Risky source changes without changed tests** (`app/dashboard/page.tsx:2`): This PR changes risky source areas but does not change any obvious test files.
- **Api area changed** (`src/api/users.ts:1`): src/api/users.ts touches a api area and should be reviewed for regression impact.
- **Auth area changed** (`src/auth/session.ts:2`): src/auth/session.ts touches a auth area and should be reviewed for regression impact.
- **Database area changed** (`prisma/schema.prisma:2`): prisma/schema.prisma touches a database area and should be reviewed for regression impact.
- **Potential silent failure path** (`src/auth/session.ts:5`): src/auth/session.ts adds code that can hide type, lint, or runtime failures.

### Medium Risk Findings

- **Broad unrelated change set**: This PR changes 5 files across 4 top-level areas and 5 risk categories.
- **Config area changed** (`vite.config.ts:1`): vite.config.ts touches a config area and should be reviewed for regression impact.
- **Ui area changed** (`app/dashboard/page.tsx:2`): app/dashboard/page.tsx touches a ui area and should be reviewed for regression impact.
- **New unchecked TypeScript escape hatch** (`src/api/users.ts:1`): src/api/users.ts adds code that can hide type, lint, or runtime failures.

### Recommended Checks

- `Add or run tests covering app/dashboard/page.tsx`
- `Add or run tests covering src/api/users.ts`
- `Add or run tests covering src/auth/session.ts`
- `Add or run tests covering vite.config.ts`

### Notes

CodeDecay is deterministic and local-first. This report was generated without telemetry, API keys, LLMs, or model calls.
