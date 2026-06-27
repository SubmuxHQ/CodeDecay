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

## Import Structured Learnings

Use `codedecay memory-import` when you want to turn structured learnings into a
reviewable local memory file instead of hand-editing everything.

```bash
npx codedecay memory-import --input incidents.json
npx codedecay memory-import --input incidents.json --apply --format json
```

Current import shapes include:

- direct CodeDecay memory sections such as `flows`, `commands`, `invariants`,
  `architecture`, and `regressions`
- `ciFailures`
- `incidents`
- `pullRequests`

The command previews the merged result by default. Use `--apply` to write the
normalized output to `.codedecay/memory.json`.

Imported learnings remain local-first and reviewable in git. After import, the
next `codedecay analyze`, `redteam`, or `agent` run will use the merged memory
to produce deterministic findings and recommended checks.

## Learn From Raw Signals

Use `codedecay memory-learn` when the input is closer to CI, PR, or CodeDecay
report data than hand-authored memory.

```bash
npx codedecay memory-learn --input ci-failure.json
npx codedecay memory-learn --input codedecay-report.json --apply --format json
npx codedecay memory-learn --input .codedecay/local/product-runs/latest.json --apply
```

Accepted inputs include:

- `ciFailures`: failing workflow, job, message, command, files, and areas
- `pullRequests`: title, body, commit messages, changed files, checks, and areas
- `reports`, `codeDecayReports`, `failOnReports`, or `blockedReports`
- a single CodeDecay JSON report with `tool: "CodeDecay"` and `findings`
- product verification reports with `tool: "CodeDecay"` and `targets`
- `productReports`, `productVerificationReports`, or `productTargetReports`

The learner converts those signals into flows, commands, architecture notes,
and past regressions. It infers impacted areas from file paths and text such as
`auth`, `api`, `schema`, `migration`, `workflow`, or `coverage`.

For product verification reports, `memory-learn` keeps only reviewable metadata:
passed generated test titles, target ids, product route/API paths, impacted
files, and rerun commands. It does not store generated test source, stdout,
stderr, screenshots, traces, request bodies, headers, cookies, or full URLs with
query strings.

`memory-learn` is deterministic and local. It does not query GitHub, inspect
remote CI, call a model, or write anything unless `--apply` is passed.

## File Format

```json
{
  "version": 1,
  "flows": [
    {
      "name": "Checkout",
      "description": "Customer checkout from cart to payment confirmation.",
      "areas": ["api", "ui"],
      "productPaths": ["/checkout", "/api/checkout"],
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
      "productPaths": ["/api/admin/users"],
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

Supported `productPaths` values are live product routes or API paths:

- UI route: `/settings`
- API path: `/api/users`
- parameterized path: `/api/users/{id}` or `/api/users/:id`

`codedecay product --generate-tests` and
`codedecay product --generate-api-tests` use product memory for priority:

- previous product regressions are generated with high priority
- passed product flows become high priority when their memory entry matches the
  current changed files or impacted areas
- changed framework routes remain high priority even without memory

## Product Memory Retention

Recommended review workflow:

- Run product verification and write a JSON report, for example
  `codedecay product --generate-api-tests --run-generated-api-tests --output .codedecay/local/product-runs/latest.json --format json`.
- Preview learned memory with
  `codedecay memory-learn --input .codedecay/local/product-runs/latest.json`.
- Re-run with `--apply` only after reviewing the preview.
- Commit `.codedecay/memory.json` like source code so changes are visible in PRs.

Retention and redaction defaults:

- `memory-learn` strips bearer tokens, common secret query keys, email
  addresses, query strings, generated test source, request bodies, headers,
  screenshots, traces, stdout, and stderr.
- Keep `.codedecay/local/**` uncommitted unless your team explicitly wants to
  review generated artifacts.
- Prune stale product memory by removing obsolete `flows[].productPaths` or
  `regressions[]` entries from `.codedecay/memory.json`; the file is intentionally
  plain JSON so pruning is a normal code-review change.
- If a learned check is flaky, edit the entry before committing it: downgrade the
  severity, add a clearer `description`, or remove the `productPaths` until the
  check is stable.

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

The v1 memory provider is the local `.codedecay/memory.json` file. CodeDecay
formalizes this behind a `MemoryProvider` interface so future adapters can map
the same provider shape to open-source or user-owned memory systems such as
Mem0 or Supermemory, while preserving the local-first default.

Any future hosted or external memory adapter should be opt-in, never required
for `codedecay analyze`, and must not change deterministic baseline scoring.

The built-in provider is:

```text
id: local
name: Local .codedecay memory
kind: local
```

External providers are not enabled by default. They must not add telemetry,
hidden network calls, API key requirements, LLM calls, or CodeDecayCloud
dependencies to the OSS workflow.
