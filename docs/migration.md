# Migration safety

CodeDecay analyzes repo-local PostgreSQL migration SQL as a **plan-only** safety
check. It does not connect to a database or apply migrations.

## What it can establish

- Operation classification (add/drop/rename/alter/index/backfill)
- Rolling-deploy blockers for destructive or rename operations
- NOT NULL without default/backfill as a static blocker
- Five-state deployment matrix statuses
- Connection-target classification (`localhost` vs production-looking hosts)
- Cleanup obligations for disposable targets (plan recorded, not executed)
- Verdicts: `plan-ready`, `plan-blocked`, `needs-execution-proof`, `not-fully-verified`

## What it cannot establish

- Existing-data compatibility
- Lock duration / live rollback success
- Mixed-version application behavior
- A `fullyVerified: true` result (always false in this slice)

## CLI / MCP

```bash
codedecay migration --file migration.sql --target-kind disposable-local --cleanup-plan "drop volume codedecay-mig"
codedecay migration --file migration.sql --connection-host db.rds.amazonaws.com
```

MCP tool: `migration_safety`.

Prisma schema-diff planning remains available through
`createPrismaMigrationAdapterPlan` (read-only `prisma migrate diff`); applying
migrations is still blocked by CodeDecay execution safety.
