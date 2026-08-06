# Runtime evidence

CodeDecay can ingest **local** OpenTelemetry JSON exports and structured
error/deployment event files as read-only engineering evidence.

## What it can establish

- Which services/routes appear in a supplied export window
- Observed latency/error counts for those operations
- Declared downstream topology neighbors (`calls`/`consumes`) and latency budgets
- Historical vs current-revision trust labels
- Cited investigation tasks for agents (never merge-safe proof by themselves)

## What it cannot establish

- That the current head revision is safe
- Absence of failures when the export is sampled
- Production state without an explicit future provider adapter and command intent
- Unredacted secret/PII payload contents (those are stripped before persistence)

## Defaults

- Provider kind: `local-artifact` only
- Zero network calls when no remote provider is configured
- Artifact: `.codedecay/local/runtime-evidence.json`
- CLI: `codedecay runtime --telemetry ... --errors ... --topology ...`
- MCP: `runtime_evidence`

Remote SaaS providers are intentionally out of this slice.
