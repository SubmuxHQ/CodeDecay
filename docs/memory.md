# Local Repo Memory

CodeDecay can read repo-local memory from `.codedecay/memory.json` and use it
to enrich PR risk reports with project-specific flows, commands, invariants,
architecture notes, and past regressions.

Memory is optional. If no memory file exists, CodeDecay uses empty defaults.
The memory file is local to the repository, is never uploaded by CodeDecay, and
does not require telemetry, API keys, LLMs, model calls, or a hosted service.

## Inspect Memory

```bash
npx codedecay memory --format markdown
npx codedecay memory --cwd ../my-repo --format json
```

`codedecay analyze` automatically applies memory when `.codedecay/memory.json`
exists in the analyzed repository.

## File Format

```json
{
  "version": 1,
  "flows": [
    {
      "name": "Checkout",
      "description": "Customer checkout from cart to payment confirmation.",
      "areas": ["api", "ui"],
      "checks": [
        "failed card retry",
        "missing shipping address",
        "duplicate webhook delivery"
      ]
    }
  ],
  "commands": [
    {
      "name": "Checkout smoke tests",
      "command": "pnpm test checkout",
      "areas": ["api", "ui"]
    }
  ],
  "invariants": [
    {
      "name": "Auth fails closed",
      "description": "Missing or invalid users must not become admins.",
      "areas": ["auth"],
      "severity": "high"
    }
  ],
  "architecture": [
    {
      "title": "Session boundary",
      "note": "Session parsing feeds all API routes.",
      "files": ["src/auth/*"]
    }
  ],
  "regressions": [
    {
      "title": "Anonymous admin fallback",
      "description": "A previous fallback user path granted admin access.",
      "areas": ["auth"],
      "check": "request protected routes without a token",
      "severity": "high"
    }
  ]
}
```

All top-level arrays are optional. Unknown fields are ignored by v1.

## Matchers

Memory entries can match changed code by impacted area, file path, or both.

Supported `areas` values:

- `api`
- `ui`
- `database`
- `auth`
- `config`
- `test`
- `source`
- `docs`

Supported `files` values are simple path patterns:

- exact path: `src/auth/session.ts`
- contains match: `auth`
- wildcard match: `src/auth/*`

## Report Behavior

When memory matches a PR, CodeDecay may add:

- findings for impacted invariants
- findings for past regression areas
- findings for matching architecture notes
- recommended checks for flows
- recommended commands from the memory file

CodeDecay does not run memory commands automatically. They are reported as
project-specific checks for the user or future execution adapters.

## Future Adapters

The v1 memory provider is the local `.codedecay/memory.json` file. Future
adapters can map the same provider shape to open-source or user-owned memory
systems such as Mem0 or Supermemory, while preserving the local-first default.

Any future hosted or external memory adapter should be opt-in, never required
for `codedecay analyze`, and must not change deterministic baseline scoring.
